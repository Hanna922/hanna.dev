---
author: Hanna922
pubDatetime: 2026-02-24T07:00:00.000Z
modDatetime:
title: MySQL Replication Deep Dive - File/Position vs GTID and Failover
titleEn: MySQL Replication Deep Dive - File/Position vs GTID and Failover
featured: false
draft: false
tags:
  - MySQL
  - Replication
  - GTID
  - Binary Log
  - Failover
  - Docker
  - Deep Dive
description: Binary Log 기반 복제 원리부터 Failover 시나리오까지, Docker 실습으로 체감해보자
---

이 글은 MySQL 8.x 기준으로 작성되었습니다.

MySQL 복제의 내부 동작 원리를 분석하고, 전통적인 File/Position 방식과 GTID 방식의 구조적 차이를 Failover 시나리오를 통해 비교합니다. 마지막으로 Docker 환경에서 두 방식의 Failover를 직접 수행하여 차이를 체감합니다.

## Prerequisites

**MySQL 복제(Replication)란**

[MySQL Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html)은 하나의 서버(Source, 과거 Master)의 데이터를 하나 이상의 서버(Replica, 과거 Slave)와 동기화하는 기능입니다. Source에서 발생한 데이터 변경 사항이 Replica로 자동 전파되어, 여러 서버가 동일한 데이터를 유지합니다.

**복제가 필요한 이유**

- **읽기 부하 분산 (Scale-Out)**: 읽기 요청을 여러 Replica에 분산하여 Source의 부하를 줄입니다
- **고가용성 (High Availability)**: Source 장애 시 Replica를 승격하여 서비스 중단을 최소화합니다
- **데이터 백업**: Source에 영향을 주지 않고 Replica에서 백업을 수행할 수 있습니다
- **지리적 분산**: 사용자와 가까운 위치에 Replica를 배치하여 지연 시간을 줄입니다

**MySQL 서버의 엔진 구조**

MySQL 서버는 크게 두 계층으로 나뉩니다. **MySQL 엔진**은 SQL 파싱, 최적화, 실행 계획 수립 등 논리적 처리를 담당하고, **스토리지 엔진**은 실제 디스크 I/O와 데이터 저장을 담당합니다.

```
클라이언트 요청
      │
      ▼
┌─────────────────────────────────┐
│         MySQL 엔진              │
│  ┌───────────┐  ┌────────────┐  │
│  │ SQL 파서  │→ │  옵티마이저 │  │
│  └───────────┘  └────────────┘  │
│         │                       │
│  ┌──────▼──────────────┐        │
│  │  실행기 (Executor)   │        │
│  └──────┬──────────────┘        │
│         │  Handler API          │
└─────────┼───────────────────────┘
          │
┌─────────▼───────────────────────┐
│      스토리지 엔진               │
│  ┌─────────┐  ┌──────────┐      │
│  │ InnoDB   │  │  MyISAM  │ ... │
│  └─────────┘  └──────────┘      │
└─────────────────────────────────┘
```

MySQL 엔진과 스토리지 엔진은 **Handler API**라는 인터페이스로 연결됩니다. MySQL 엔진이 쿼리를 파싱하고 실행 계획을 세우면, 실행기(Executor)가 Handler API를 통해 스토리지 엔진에게 데이터 읽기/쓰기를 요청합니다. 이 설계 덕분에 InnoDB, MyISAM 등 여러 스토리지 엔진을 플러그인처럼 교체할 수 있습니다.

복제의 핵심인 **Binary Log**는 MySQL 엔진 레벨에서 기록됩니다. 따라서 스토리지 엔진이 InnoDB든 MyISAM이든 상관없이 복제가 가능합니다. 다만 InnoDB가 트랜잭션을 지원하므로 GTID 기반 복제에서 더 안정적입니다.

**트랜잭션 격리 수준과 복제의 관계**

MySQL의 기본 격리 수준은 `REPEATABLE READ`입니다. 복제 환경에서는 격리 수준이 Binary Log 형식과 밀접한 관련이 있습니다.

- **STATEMENT 기반 로깅**: SQL 문 자체를 기록합니다. `READ COMMITTED` 격리 수준에서는 Non-Repeatable Read가 허용되어, 동일한 SQL이 Source와 Replica에서 다른 결과를 낼 수 있습니다
- **ROW 기반 로깅**: 변경된 행 데이터를 직접 기록합니다. SQL을 재실행하는 것이 아니라 변경 결과를 그대로 적용하므로, 격리 수준과 관계없이 데이터 일관성이 보장됩니다
- **MIXED**: MySQL이 상황에 따라 STATEMENT와 ROW를 자동 선택합니다

> MySQL 8.x의 기본값은 `binlog_format=ROW`이므로 대부분의 경우 격리 수준과 관계없이 안전하게 복제됩니다. 이러한 이유로 현대 MySQL 환경에서는 ROW 기반 로깅이 사실상 표준입니다.

---

# Part 1. Binary Log 기반 복제의 동작 원리

MySQL 복제의 중심에는 **Binary Log (binlog)**가 있습니다. Source에서 발생하는 모든 데이터 변경 사항이 이 로그에 기록되고, Replica가 이 로그를 읽어 동일한 변경을 재현합니다.

## **1. Binary Log란**

Binary Log는 Source 서버에서 데이터를 변경하는 모든 이벤트(INSERT, UPDATE, DELETE, DDL 등)를 순서대로 기록하는 로그 파일입니다. 이 로그는 여러 개의 파일로 관리되며, 각 파일에는 고유한 파일명과 내부 바이트 Position이 부여됩니다.

```
mysql-bin.000001  ← 첫 번째 binlog 파일
  │  Position 4:    Format Description Event
  │  Position 126:  Previous GTIDs Event
  │  Position 158:  BEGIN
  │  Position 231:  INSERT INTO products VALUES('apple')
  │  Position 389:  COMMIT
  │  Position 420:  BEGIN
  │  Position 493:  INSERT INTO products VALUES('banana')
  │  Position 658:  COMMIT
  │  ...
mysql-bin.000002  ← 다음 binlog 파일 (로테이션 후)
  │  Position 4:    Format Description Event
  │  ...
```

Binary Log의 활성화는 `my.cnf`에서 설정합니다.

```ini
[mysqld]
log-bin=mysql-bin    # binlog 파일명 접두사
server-id=1          # 복제 토폴로지에서 고유한 서버 식별자
```

## **2. 복제의 3-Thread 모델**

MySQL 복제는 세 개의 스레드가 협력하여 동작합니다.

```
Source 서버                              Replica 서버
┌──────────────┐                    ┌──────────────────────┐
│              │                    │                      │
│  Binary Log  │ ←── Binlog Dump ──│→ I/O Thread          │
│  (mysql-bin) │     Thread         │    │                 │
│              │                    │    ▼                 │
│              │                    │  Relay Log           │
│              │                    │  (relay-bin)         │
│              │                    │    │                 │
│              │                    │    ▼                 │
│              │                    │  SQL Thread          │
│              │                    │    │                 │
│              │                    │    ▼                 │
│              │                    │  데이터에 적용        │
└──────────────┘                    └──────────────────────┘
```

**Source 측: Binlog Dump Thread**

Replica가 연결되면 Source에서 자동으로 생성되는 스레드입니다. Binary Log의 이벤트를 읽어 Replica로 전송하는 역할을 합니다. Replica마다 하나의 Dump Thread가 할당됩니다.

**Replica 측: I/O Thread**

Source의 Binlog Dump Thread에 연결하여 Binary Log 이벤트를 수신하고, 이를 Replica 로컬에 **Relay Log** 파일로 기록합니다. 네트워크를 통한 데이터 수신만 담당하므로, Source가 다운되면 이 스레드의 연결이 끊어집니다.

**Replica 측: SQL Thread**

Relay Log에 기록된 이벤트를 순서대로 읽어 실제 데이터에 적용합니다. 이 스레드가 `INSERT`, `UPDATE`, `DELETE` 등을 실행하여 Replica의 데이터를 Source와 동일하게 만듭니다.

> **I/O Thread와 SQL Thread가 분리된 이유 🧐**
>
> 네트워크 수신과 SQL 실행을 하나의 스레드로 처리하면, SQL 실행이 느릴 때 네트워크 수신도 멈춥니다. 두 스레드를 분리하면, I/O Thread는 네트워크 속도에 맞춰 빠르게 Relay Log에 기록하고, SQL Thread는 자기 페이스에 맞춰 적용할 수 있습니다. 이 설계 덕분에 Source가 다운되어도 Relay Log에 이미 수신된 이벤트는 SQL Thread가 계속 적용할 수 있습니다.

이제 복제에서 **"Replica가 어디까지 읽었는가"**를 추적하는 방식에 따라 두 가지로 나뉩니다: **File/Position 방식**과 **GTID 방식**입니다.

---

# Part 2. File/Position 기반 복제

## **1. 개념: 파일명 + 바이트 오프셋으로 위치 추적**

File/Position 방식은 MySQL의 가장 전통적인 복제 방법입니다. Replica가 Source의 Binary Log를 **"어떤 파일의 몇 번째 바이트까지 읽었는가"**로 추적합니다.

```
위치 식별자 = 파일명(mysql-bin.000001) + 바이트 오프셋(Position: 658)
```

이 방식에서는 Replica가 Source에 연결할 때, 이 두 좌표를 관리자가 직접 확인하여 명시적으로 지정해야 합니다.

## **2. 복제 설정 과정**

**Source 측: binlog 좌표 확인**

```sql
SHOW BINARY LOG STATUS\G
```

```
File: mysql-bin.000001
Position: 658
```

**Replica 측: 좌표 지정하여 복제 시작**

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='source-server',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_LOG_FILE='mysql-bin.000001',   -- ★ 파일명 수동 지정
  SOURCE_LOG_POS=658;                   -- ★ Position 수동 지정

START REPLICA;
```

핵심은 `SOURCE_LOG_FILE`과 `SOURCE_LOG_POS`를 **관리자가 직접 확인하고 지정**해야 한다는 것입니다.

## **3. 복제 동작 흐름**

```
1. Source: INSERT INTO products VALUES('cherry')
   → Binary Log에 기록: mysql-bin.000001, pos:658~820

2. Binlog Dump Thread: pos:658~820 이벤트를 Replica에 전송

3. Replica I/O Thread: 수신한 이벤트를 Relay Log에 기록

4. Replica SQL Thread: Relay Log에서 이벤트를 읽어 실행
   → INSERT INTO products VALUES('cherry')

5. Replica: Exec_Source_Log_Pos를 820으로 갱신
   → "mysql-bin.000001의 820 바이트까지 적용 완료"
```

`SHOW REPLICA STATUS\G`로 현재 어디까지 읽고 적용했는지 확인할 수 있습니다.

```
Source_Log_File: mysql-bin.000001
Read_Source_Log_Pos: 820      ← I/O Thread가 읽은 위치
Exec_Source_Log_Pos: 820      ← SQL Thread가 적용한 위치
```

## **4. File/Position 방식의 한계 — Failover에서 드러나는 치명적 문제**

File/Position 방식의 가장 큰 한계는 **서버마다 Binary Log 좌표 체계가 독립적**이라는 것입니다.

동일한 트랜잭션이라도 각 서버의 Binary Log에 기록되는 파일명과 Position은 완전히 다릅니다. Source(A)의 `mysql-bin.000003:4500`에 해당하는 이벤트가 Replica(B)의 Binary Log에서는 `mysql-bin.000001:1200` 위치에 있을 수 있습니다. **이 두 좌표 사이에는 어떤 매핑 관계도 없습니다.** 이것이 Failover에서 심각한 문제를 일으키며, 이 문제는 Part 4에서 상세히 다룹니다.

---

# Part 3. GTID 기반 복제

## **1. 개념: 전역 고유 트랜잭션 ID로 위치 추적**

GTID(Global Transaction Identifier)는 MySQL 5.6에서 도입된 복제 방식으로, 모든 트랜잭션에 **전역적으로 고유한 식별자**를 부여합니다.

```
GTID 형식 = source_uuid:transaction_id

예시: 3E11FA47-71CA-11E1-9E33-C80AA9429562:23
      ├─────── server_uuid ───────────────┤ ├─ 순번 ─┤
```

`server_uuid`는 MySQL 서버가 최초 시작될 때 자동 생성되는 128비트 고유값이고, `transaction_id`는 해당 서버에서 순차적으로 증가하는 번호입니다. 따라서 전체 복제 토폴로지에서 동일한 GTID를 가진 트랜잭션은 절대 존재하지 않습니다.

## **2. GTID의 핵심 메커니즘: Executed_Gtid_Set**

모든 MySQL 서버는 자신이 **지금까지 실행한 GTID의 집합**을 관리합니다. 이것이 `Executed_Gtid_Set`입니다.

```sql
SHOW BINARY LOG STATUS\G
```

```
Executed_Gtid_Set: 3E11FA47-71CA-11E1:1-42,
                   7B22CC90-81AA-22E2:1-5
```

위 결과는 이 서버가 UUID `3E11FA47`에서 발생한 트랜잭션 1~42번, UUID `7B22CC90`에서 발생한 트랜잭션 1~5번을 모두 실행했다는 의미입니다.

## **3. Auto-Positioning: 파일명·Position 없이 자동 동기화**

GTID 방식의 핵심 기능은 **Auto-Positioning**입니다. Replica가 Source에 연결할 때, 자신의 `Executed_Gtid_Set`을 전송합니다. Source는 이를 자신의 `Executed_Gtid_Set`과 비교하여, Replica에 없는 트랜잭션만 자동으로 전송합니다.

```
Replica의 Executed_Gtid_Set: {UUID-A:1-42}
Source의  Executed_Gtid_Set: {UUID-A:1-50}

→ Source가 자동 계산: UUID-A:43~50이 부족하다
→ 해당 트랜잭션만 전송
```

이 과정에서 파일명이나 Position은 전혀 필요하지 않습니다.

> **File/Position과의 근본적인 차이 🧐**
>
> File/Position은 **"서버 로컬 좌표"**입니다. `mysql-bin.000001:658`이라는 좌표는 해당 서버에서만 의미가 있고, 다른 서버의 좌표와 매핑이 불가능합니다. 반면 GTID는 **"전역 좌표"**입니다. `3E11FA47:42`라는 GTID는 어떤 서버에서든 동일한 트랜잭션을 의미합니다. 이것이 Failover에서 결정적인 차이를 만듭니다.

## **4. 복제 설정 과정**

**my.cnf 설정 (Source와 Replica 모두)**

```ini
[mysqld]
log-bin=mysql-bin
server-id=1                       # 서버마다 다른 값
gtid_mode=ON                      # ★ GTID 활성화
enforce_gtid_consistency=ON       # ★ GTID 안전성 보장
```

`enforce_gtid_consistency=ON`은 GTID와 호환되지 않는 SQL을 차단합니다. 대표적으로 `CREATE TABLE ... SELECT` 구문이 차단되는데, 이 구문은 DDL(테이블 생성)과 DML(데이터 삽입)이 하나의 문장에 섞여 있어 단일 GTID로 표현할 수 없기 때문입니다.

**Replica 측: 복제 시작**

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='source-server',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_AUTO_POSITION=1;          -- ★ 이것만 지정하면 끝!

START REPLICA;
```

File/Position 방식과 비교하면, `SOURCE_LOG_FILE`과 `SOURCE_LOG_POS`가 없습니다. `SOURCE_AUTO_POSITION=1`만 지정하면, Replica가 자신의 `Executed_Gtid_Set`을 기반으로 자동으로 동기화를 시작합니다.

## **5. GTID 복제 동작 흐름**

```
1. Source: INSERT INTO products VALUES('cherry')
   → GTID 할당: 3E11FA47:43
   → Binary Log에 기록

2. Binlog Dump Thread: GTID 3E11FA47:43 이벤트를 Replica에 전송

3. Replica I/O Thread: 수신 → Relay Log에 기록

4. Replica SQL Thread: 실행 후 Executed_Gtid_Set에 추가
   → Executed_Gtid_Set: {3E11FA47:1-43}

5. Replica: "3E11FA47의 43번까지 적용 완료"
```

## **6. GTID 방식의 제약사항**

- `CREATE TABLE ... SELECT` 등 GTID 비안전 구문이 차단됩니다
- MySQL 5.6+ 필요합니다 (안정적 사용은 5.7+ 권장)
- 토폴로지 내 모든 서버에서 `gtid_mode=ON` 설정이 필요합니다
- 운영 중 전환 시 `OFF → OFF_PERMISSIVE → ON_PERMISSIVE → ON` 순서로 단계적 변경이 필요합니다

---

# Part 4. Failover 시나리오 비교 — 핵심 차이의 결정적 순간

두 방식의 근본적인 차이는 **Source 장애 시 Replica를 새 Source로 전환하는 과정**에서 극명하게 드러납니다. 동일한 토폴로지에서 동일한 장애를 가정합니다.

```
정상 상태:
  Source(A) ──→ Replica(B)
            └─→ Replica(C)

장애 발생:
  Source(A) DOWN! 💥
  → Replica(B)를 새 Source로 승격
  → Replica(C)를 새 Source(B)에 연결
```

## **1. File/Position 방식의 Failover**

```
단계 1. Source(A) DOWN! → B, C의 I/O Thread 연결 끊김

단계 2. Replica(B)를 새 Source로 승격
        STOP REPLICA;
        RESET REPLICA ALL;

단계 3. ★ 핵심 문제 발생!
        C의 마지막 좌표: A의 mysql-bin.000003:4500
        B의 현재 좌표:   B의 mysql-bin.000001:1200
        → 좌표 체계가 완전히 다름!
        → A의 pos:4500이 B에서 몇 번 Position인지 알 수 없음!

단계 4. 관리자가 수동으로 해결해야 하는 작업:
        a) mysqlbinlog 도구로 A의 binlog 파싱
        b) A의 pos:4500에 해당하는 마지막 이벤트를 식별
        c) B의 binlog에서 동일한 이벤트를 찾아 Position 확인
        d) 해당 Position을 C에 설정
        → 약 15~30분+ 소요, 인적 오류 위험 높음

단계 5. (Position을 찾았다고 가정)
        CHANGE REPLICATION SOURCE TO
          SOURCE_HOST='B',
          SOURCE_LOG_FILE='mysql-bin.000001',
          SOURCE_LOG_POS=1200;   -- ⚠️ 이 값이 맞는지 확신할 수 없음
        START REPLICA;
```

## **2. GTID 방식의 Failover**

```
단계 1. Source(A) DOWN! → B, C의 I/O Thread 연결 끊김

단계 2. Replica(B)를 새 Source로 승격
        STOP REPLICA;
        RESET REPLICA ALL;

단계 3. Replica(C)에서 실행 — 단 3줄!
        STOP REPLICA;
        CHANGE REPLICATION SOURCE TO
          SOURCE_HOST='B',
          SOURCE_AUTO_POSITION=1;   -- ★ 이것만!
        START REPLICA;

단계 4. 내부 동작:
        C가 B에게 Executed_Gtid_Set을 전송
        → B가 자동으로 C에 없는 트랜잭션만 전송
        → 약 10~30초 만에 복제 재개
```

## **3. 비교 요약**

| 항목                      | File/Position                       | GTID                            |
| ------------------------- | ----------------------------------- | ------------------------------- |
| **위치 추적**             | 파일명 + 바이트 오프셋              | 전역 고유 ID (UUID:N)           |
| **설정 핵심**             | `SOURCE_LOG_FILE`, `SOURCE_LOG_POS` | `SOURCE_AUTO_POSITION=1`        |
| **Failover 시 핵심 작업** | mysqlbinlog로 좌표 수동 재계산      | 호스트명만 변경                 |
| **Failover 복구 시간**    | 15~30분+                            | 10~30초                         |
| **인적 오류 위험**        | 높음 (좌표 오계산 가능)             | 낮음 (자동 계산)                |
| **멀티소스 복제**         | 각 Source별 좌표 관리               | UUID로 자동 구분                |
| **트랜잭션 건너뛰기**     | `sql_slave_skip_counter`            | `SET GTID_NEXT='uuid:N'`        |
| **SQL 제약사항**          | 없음                                | `CREATE TABLE...SELECT` 등 제한 |
| **최소 버전**             | 전 버전                             | 5.6+ (권장 5.7+)                |

---

# Part 5. Docker 실습으로 Failover 체감하기

이론만으로는 두 방식의 차이를 실감하기 어렵습니다. Docker로 `Source(A) → Replica(B), Replica(C)` 토폴로지를 구축하고, Source(A)를 다운시킨 후 두 방식의 Failover를 직접 수행하여 차이를 체감합니다.

## **1. File/Position 기반 Failover 실습**

### Step 1. 환경 구성

```bash
# 네트워크 생성
docker network create fp-net

# Source(A), Replica(B), Replica(C) 컨테이너 생성
docker run -d --name fp-source-a --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name fp-replica-b --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name fp-replica-c --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql
```

### Step 2. my.cnf 설정

각 컨테이너에서 `/etc/my.cnf`의 `[mysqld]` 섹션에 추가합니다.

```bash
# Source(A)
docker exec fp-source-a bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=1
EOF'

# Replica(B) — server-id=2
docker exec fp-replica-b bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=2
EOF'

# Replica(C) — server-id=3
docker exec fp-replica-c bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=3
EOF'

# 3대 모두 재시작
docker restart fp-source-a fp-replica-b fp-replica-c
```

### Step 3. Source(A)에서 복제 계정 + 테스트 데이터 생성

```bash
docker exec -it fp-source-a mysql -u root -p1234
```

```sql
CREATE USER 'repl'@'%' IDENTIFIED BY '1234';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;

CREATE DATABASE shopdb;
USE shopdb;
CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50));
INSERT INTO products (name) VALUES ('apple'), ('banana'), ('cherry');
```

### Step 4. 데이터 덤프 + Replica에 적용

```bash
# Source의 데이터를 덤프 (--source-data로 binlog 좌표 포함)
docker exec fp-source-a bash -c \
  "mysqldump -u root -p1234 --all-databases \
   --triggers --routines --events --source-data > /tmp/dump.sql"

# 덤프 파일 복사 + 적용
docker cp fp-source-a:/tmp/dump.sql ./fp-dump.sql
docker cp ./fp-dump.sql fp-replica-b:/tmp/dump.sql
docker cp ./fp-dump.sql fp-replica-c:/tmp/dump.sql
docker exec fp-replica-b bash -c "mysql -u root -p1234 < /tmp/dump.sql"
docker exec fp-replica-c bash -c "mysql -u root -p1234 < /tmp/dump.sql"
```

### Step 5. Replica(B), (C)에서 복제 시작

덤프 파일에 포함된 binlog 좌표를 확인합니다.

```bash
docker exec fp-source-a mysql -u root -p1234 -e "SHOW BINARY LOG STATUS\G"
```

```
File: mysql-bin.000001
Position: 1890
```

확인한 좌표를 사용하여 B, C에서 복제를 설정합니다.

```sql
-- B, C 각각에서 실행
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='fp-source-a',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_LOG_FILE='mysql-bin.000001',  -- ★ 파일명 수동 지정
  SOURCE_LOG_POS=1890;                 -- ★ Position 수동 지정

START REPLICA;
```

### Step 6. 💥 Source(A) 장애 발생!

```bash
docker stop fp-source-a
```

### Step 7. Replica(B)를 새 Source로 승격

```bash
docker exec -it fp-replica-b mysql -u root -p1234
```

```sql
STOP REPLICA;
RESET REPLICA ALL;

-- B에서 복제 계정 생성
CREATE USER 'repl'@'%' IDENTIFIED BY '1234';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- B의 현재 binlog 좌표 확인
SHOW BINARY LOG STATUS\G
```

```
File: mysql-bin.000001
Position: 876    ← A의 Position(1890)과 완전히 다른 값!
```

### Step 8. ⚠️ Replica(C)를 새 Source(B)에 연결 — 여기서 문제 발생

```bash
docker exec -it fp-replica-c mysql -u root -p1234
```

```sql
STOP REPLICA;

CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='fp-replica-b',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_LOG_FILE='mysql-bin.000001',
  SOURCE_LOG_POS=876;   -- ⚠️ 이 값이 정확한지 확신할 수 없음!

START REPLICA;
SHOW REPLICA STATUS\G
```

> **체감 포인트 🧐**
>
> B의 `SHOW BINARY LOG STATUS`에서 나온 Position을 그대로 사용했지만, 이것이 C가 이미 적용한 마지막 트랜잭션의 다음 위치인지 보장할 수 없습니다. B의 승격 과정에서 실행한 `RESET REPLICA ALL`, `CREATE USER` 등이 B의 binlog에 추가로 기록되었기 때문입니다. 정확한 Position을 찾으려면 `mysqlbinlog` 도구로 B의 binlog를 파싱하여 C가 마지막으로 적용한 이벤트를 찾아야 합니다. 이 과정이 15~30분 이상 소요될 수 있습니다.

---

## **2. GTID 기반 Failover 실습**

이제 동일한 토폴로지를 GTID 방식으로 구축하고 Failover를 수행합니다.

### Step 1. 환경 구성

```bash
docker network create gtid-net

docker run -d --name gtid-source-a --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name gtid-replica-b --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name gtid-replica-c --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql
```

### Step 2. my.cnf 설정 — GTID 활성화

```bash
# Source(A)
docker exec gtid-source-a bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=1
gtid_mode=ON
enforce_gtid_consistency=ON
EOF'

# Replica(B) — server-id=2
docker exec gtid-replica-b bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=2
gtid_mode=ON
enforce_gtid_consistency=ON
EOF'

# Replica(C) — server-id=3
docker exec gtid-replica-c bash -c 'cat >> /etc/my.cnf << EOF
[mysqld]
log-bin=mysql-bin
server-id=3
gtid_mode=ON
enforce_gtid_consistency=ON
EOF'

docker restart gtid-source-a gtid-replica-b gtid-replica-c
```

### Step 3. Source(A)에서 복제 계정 + 테스트 데이터 생성

```bash
docker exec -it gtid-source-a mysql -u root -p1234
```

```sql
CREATE USER 'repl'@'%' IDENTIFIED BY '1234';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;

CREATE DATABASE shopdb;
USE shopdb;
CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50));
INSERT INTO products (name) VALUES ('apple'), ('banana'), ('cherry');
```

### Step 4. 데이터 덤프 + Replica에 적용

```bash
docker exec gtid-source-a bash -c \
  "mysqldump -u root -p1234 --all-databases \
   --triggers --routines --events --set-gtid-purged=ON > /tmp/dump.sql"
```

> `--set-gtid-purged=ON`이 핵심입니다. dump 파일에 `SET @@GLOBAL.GTID_PURGED='...'` 구문이 포함되어, Replica가 어디부터 복제해야 하는지 자동으로 알 수 있게 합니다. File/Position 방식에서 `--source-data`로 binlog 좌표를 포함시키는 것과 대응됩니다.

```bash
docker cp gtid-source-a:/tmp/dump.sql ./gtid-dump.sql
docker cp ./gtid-dump.sql gtid-replica-b:/tmp/dump.sql
docker cp ./gtid-dump.sql gtid-replica-c:/tmp/dump.sql
docker exec gtid-replica-b bash -c "mysql -u root -p1234 < /tmp/dump.sql"
docker exec gtid-replica-c bash -c "mysql -u root -p1234 < /tmp/dump.sql"
```

### Step 5. Replica(B), (C)에서 복제 시작

```sql
-- B, C 각각에서 실행
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='gtid-source-a',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_AUTO_POSITION=1;          -- ★ 파일명·Position 지정 없음!

START REPLICA;
```

File/Position 방식과 비교하면, `SOURCE_LOG_FILE`과 `SOURCE_LOG_POS`가 사라지고 `SOURCE_AUTO_POSITION=1`만 남았습니다.

### Step 6. 정상 복제 확인

```bash
# Source(A)에서 추가 데이터 삽입
docker exec gtid-source-a mysql -u root -p1234 -e \
  "INSERT INTO shopdb.products (name) VALUES ('date'), ('elderberry');"

# Replica(C)에서 확인
docker exec gtid-replica-c mysql -u root -p1234 -e \
  "SELECT * FROM shopdb.products;"
```

5개의 행(apple, banana, cherry, date, elderberry)이 보이면 정상입니다.

### Step 7. 💥 Source(A) 장애 발생!

```bash
docker stop gtid-source-a
```

### Step 8. Replica(B)를 새 Source로 승격

```bash
docker exec -it gtid-replica-b mysql -u root -p1234
```

```sql
STOP REPLICA;
RESET REPLICA ALL;

CREATE USER 'repl'@'%' IDENTIFIED BY '1234';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
```

### Step 9. ⚡ Replica(C)를 새 Source(B)로 전환 — 단 3줄!

```bash
docker exec -it gtid-replica-c mysql -u root -p1234
```

```sql
STOP REPLICA;

CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='gtid-replica-b',     -- ★ 호스트만 변경!
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_AUTO_POSITION=1;           -- ★ Position 계산 불필요!

START REPLICA;
SHOW REPLICA STATUS\G
```

```
Replica_IO_Running: Yes
Replica_SQL_Running: Yes
```

> 🎉 **끝입니다.** Position을 계산할 필요가 전혀 없었습니다.

### Step 10. 검증

```bash
# 새 Source(B)에서 데이터 추가
docker exec gtid-replica-b mysql -u root -p1234 -e \
  "INSERT INTO shopdb.products (name) VALUES ('fig');"

# Replica(C)에서 확인
docker exec gtid-replica-c mysql -u root -p1234 -e \
  "SELECT * FROM shopdb.products;"
```

`fig`가 보이면 GTID 기반 Failover가 완전히 성공한 것입니다.

## **3. 실습 중 만날 수 있는 트러블슈팅**

GTID 방식의 Failover에서 다음과 같은 에러를 만날 수 있습니다.

```
Last_IO_Error: Got fatal error 1236 from source when reading data from binary log:
'Cannot replicate because the source purged required binary logs containing GTIDs
that the replica requires.'
```

또는 SQL Thread에서 다음과 같은 에러가 발생할 수 있습니다.

```
Replica_SQL_Running: No
Last_Errno: 1410
Last_Error: Worker 1 failed executing transaction
'a7b30e60-1084-11f1-ae76-26b542c8e9fd:6'
```

**원인 분석**

B를 승격할 때 실행한 `RESET REPLICA ALL`, `CREATE USER`, `GRANT` 등의 명령이 B의 UUID로 새로운 GTID를 생성합니다. C가 B에 연결할 때, B는 이 GTID들을 C에 전송하려 합니다. 그런데 이 GTID들이 C에 이미 있는 데이터와 충돌하거나(예: `CREATE USER 'repl'`이 이미 존재), C가 이 GTID들을 필요로 하는데 B의 binlog에서 이미 purge된 경우 에러가 발생합니다.

**해결 방법: 빈 트랜잭션 주입**

C에서 해당 GTID들을 "이미 실행한 것으로" 표시하여 건너뛸 수 있습니다.

```sql
STOP REPLICA;

-- 누락된 GTID를 빈 트랜잭션으로 주입
SET GTID_NEXT='a7b30e60-1084-11f1-ae76-26b542c8e9fd:1';
BEGIN; COMMIT;

SET GTID_NEXT='a7b30e60-1084-11f1-ae76-26b542c8e9fd:2';
BEGIN; COMMIT;

-- ... 누락된 번호만큼 반복 ...

SET GTID_NEXT='AUTOMATIC';  -- 다시 자동 모드로 복구

START REPLICA;
SHOW REPLICA STATUS\G
```

> **GTID의 진단 우위 🧐**
>
> 에러 메시지에 정확히 **어떤 GTID(`a7b30e60:6`)가 문제인지** 명시됩니다. 따라서 해당 GTID만 건너뛰면 해결할 수 있습니다. File/Position 방식에서는 이런 수준의 진단 자체가 불가능합니다. "어떤 트랜잭션이 누락되었는가"를 알려면 binlog를 직접 파싱해야 합니다.

**운영 환경에서의 예방 방법**

- 승격 대상 Replica에 미리 복제 계정을 만들어 두면 승격 시 `CREATE USER`가 불필요합니다
- MySQL Group Replication이나 InnoDB Cluster 같은 자동 Failover 솔루션을 사용하면, 빈 트랜잭션 주입 같은 수동 작업이 필요 없습니다
- Orchestrator 같은 복제 관리 도구를 활용하면 Failover 과정을 자동화할 수 있습니다

---

## Closing Thoughts (๑╹o╹)✎

이번 글을 작성하면서 평소에 "복제는 설정만 하면 되는 거 아닌가?"라고 가볍게 생각했던 부분이, 실제 Failover 상황에서는 완전히 다른 문제가 된다는 것을 체감할 수 있었습니다. 특히 Docker로 File/Position 방식의 Failover를 직접 수행했을 때, B의 Position을 수동으로 찾아야 하는 과정에서 "이 값이 정말 맞나?"라는 불안감이 컸고, 직후에 GTID로 동일한 작업을 3줄 만에 끝내는 경험은 인상 깊었습니다.

GTID Failover 실습에서 `Cannot replicate because the source purged required binary logs` 에러와 `Worker failed executing transaction` 에러를 직접 만나 해결하는 과정도 의미 있었습니다. 에러 메시지에서 정확한 GTID를 알려주기 때문에, 빈 트랜잭션 주입으로 해결할 수 있다는 점이 File/Position과의 결정적 차이라고 느꼈습니다.

틀린 내용이 있다면 댓글로 알려주세요. 🙇🏻‍♀️

## References

- [MySQL 8.4 Reference Manual — Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html)
- [MySQL 8.4 Reference Manual — GTID Concepts](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-concepts.html)
- [MySQL 8.4 Reference Manual — Replication with GTIDs](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids.html)
- [MySQL 8.4 Reference Manual — Binary Log](https://dev.mysql.com/doc/refman/8.4/en/binary-log.html)
- [MySQL 8.4 Reference Manual — InnoDB and MySQL Replication](https://dev.mysql.com/doc/refman/8.4/en/innodb-and-mysql-replication.html)
- [MySQL 복제 교안 — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/replication/mysql-replication-overview)
- [MySQL 복제 실습 교안 — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/replication/practice)
- [트랜잭션 격리 수준 교안 — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/transaction/10.isolation-level)
- [MySQL 엔진 구조 교안 — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/transaction/11.mysql-engines)
