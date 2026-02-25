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
description: From Binary Log internals to Failover scenarios, hands-on with Docker
---

This post is written based on MySQL 8.x.

Analyzing the internal workings of MySQL replication, comparing the structural differences between the traditional File/Position method and the GTID method through Failover scenarios, and experiencing the difference firsthand by performing Failover with both methods in a Docker environment.

## Prerequisites

**What is MySQL Replication?**

[MySQL Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html) is a feature that synchronizes data from one server (Source, formerly Master) to one or more servers (Replica, formerly Slave). Data changes occurring on the Source are automatically propagated to Replicas, maintaining identical data across multiple servers.

**Why Replication is Needed**

- **Read Load Distribution (Scale-Out)**: Distributes read requests across multiple Replicas to reduce the Source's load
- **High Availability**: Promotes a Replica when the Source fails, minimizing service interruption
- **Data Backup**: Allows backups to be performed on Replicas without affecting the Source
- **Geographic Distribution**: Places Replicas close to users to reduce latency

**MySQL Server's Engine Architecture**

The MySQL server is broadly divided into two layers. The **MySQL Engine** handles logical processing such as SQL parsing, optimization, and execution plan creation, while the **Storage Engine** handles actual disk I/O and data storage.

```
Client Request
      │
      ▼
┌─────────────────────────────────┐
│         MySQL Engine            │
│  ┌───────────┐  ┌────────────┐  │
│  │ SQL Parser │→ │  Optimizer  │  │
│  └───────────┘  └────────────┘  │
│         │                       │
│  ┌──────▼──────────────┐        │
│  │  Executor            │        │
│  └──────┬──────────────┘        │
│         │  Handler API          │
└─────────┼───────────────────────┘
          │
┌─────────▼───────────────────────┐
│      Storage Engine             │
│  ┌─────────┐  ┌──────────┐      │
│  │ InnoDB   │  │  MyISAM  │ ... │
│  └─────────┘  └──────────┘      │
└─────────────────────────────────┘
```

The MySQL Engine and Storage Engine are connected through an interface called the **Handler API**. When the MySQL Engine parses a query and creates an execution plan, the Executor requests data read/write operations from the Storage Engine through the Handler API. Thanks to this design, storage engines like InnoDB and MyISAM can be swapped out like plugins.

The **Binary Log**, which is central to replication, is recorded at the MySQL Engine level. Therefore, replication works regardless of whether the storage engine is InnoDB or MyISAM. However, since InnoDB supports transactions, it provides greater stability in GTID-based replication.

**Transaction Isolation Levels and Replication**

MySQL's default isolation level is `REPEATABLE READ`. In a replication environment, the isolation level is closely related to the Binary Log format.

- **STATEMENT-based logging**: Records the SQL statement itself. At the `READ COMMITTED` isolation level, Non-Repeatable Reads are allowed, so the same SQL could produce different results on Source and Replica
- **ROW-based logging**: Records the changed row data directly. Since it applies the change results as-is rather than re-executing SQL, data consistency is guaranteed regardless of isolation level
- **MIXED**: MySQL automatically selects between STATEMENT and ROW depending on the situation

> MySQL 8.x defaults to `binlog_format=ROW`, so replication is safe regardless of isolation level in most cases. This is why ROW-based logging is effectively the standard in modern MySQL environments.

---

# Part 1. How Binary Log-Based Replication Works

At the center of MySQL replication is the **Binary Log (binlog)**. All data changes occurring on the Source are recorded in this log, and Replicas read this log to reproduce the same changes.

## **1. What is Binary Log?**

Binary Log is a log file that sequentially records all events that modify data on the Source server (INSERT, UPDATE, DELETE, DDL, etc.). This log is managed across multiple files, each with a unique filename and internal byte Position.

```
mysql-bin.000001  ← first binlog file
  │  Position 4:    Format Description Event
  │  Position 126:  Previous GTIDs Event
  │  Position 158:  BEGIN
  │  Position 231:  INSERT INTO products VALUES('apple')
  │  Position 389:  COMMIT
  │  Position 420:  BEGIN
  │  Position 493:  INSERT INTO products VALUES('banana')
  │  Position 658:  COMMIT
  │  ...
mysql-bin.000002  ← next binlog file (after rotation)
  │  Position 4:    Format Description Event
  │  ...
```

Binary Log is enabled in `my.cnf`.

```ini
[mysqld]
log-bin=mysql-bin    # binlog filename prefix
server-id=1          # unique server identifier in the replication topology
```

## **2. The 3-Thread Replication Model**

MySQL replication operates through the cooperation of three threads.

```
Source Server                            Replica Server
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
│              │                    │  Apply to data       │
└──────────────┘                    └──────────────────────┘
```

**Source side: Binlog Dump Thread**

This thread is automatically created on the Source when a Replica connects. It reads Binary Log events and sends them to the Replica. One Dump Thread is allocated per Replica.

**Replica side: I/O Thread**

Connects to the Source's Binlog Dump Thread, receives Binary Log events, and writes them to a local **Relay Log** file on the Replica. Since it only handles network data reception, this thread's connection is severed when the Source goes down.

**Replica side: SQL Thread**

Reads events from the Relay Log in order and applies them to the actual data. This thread executes `INSERT`, `UPDATE`, `DELETE`, etc. to make the Replica's data identical to the Source's.

> **Why are the I/O Thread and SQL Thread separated? 🧐**
>
> If network reception and SQL execution were handled by a single thread, slow SQL execution would also block network reception. By separating the two threads, the I/O Thread can quickly write to the Relay Log at network speed, while the SQL Thread can apply changes at its own pace. Thanks to this design, even if the Source goes down, events already received in the Relay Log can continue to be applied by the SQL Thread.

Now, replication diverges into two methods depending on how **"how far the Replica has read"** is tracked: the **File/Position method** and the **GTID method**.

---

# Part 2. File/Position-Based Replication

## **1. Concept: Tracking Position with Filename + Byte Offset**

The File/Position method is MySQL's most traditional replication approach. Replicas track the Source's Binary Log by **"which file and how many bytes have been read."**

```
Position identifier = Filename(mysql-bin.000001) + Byte offset(Position: 658)
```

In this method, when a Replica connects to the Source, the administrator must manually verify and explicitly specify these two coordinates.

## **2. Replication Setup Process**

**Source side: Check binlog coordinates**

```sql
SHOW BINARY LOG STATUS\G
```

```
File: mysql-bin.000001
Position: 658
```

**Replica side: Start replication with specified coordinates**

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='source-server',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_LOG_FILE='mysql-bin.000001',   -- ★ manually specified filename
  SOURCE_LOG_POS=658;                   -- ★ manually specified Position

START REPLICA;
```

The key point is that `SOURCE_LOG_FILE` and `SOURCE_LOG_POS` must be **manually verified and specified by the administrator**.

## **3. Replication Operation Flow**

```
1. Source: INSERT INTO products VALUES('cherry')
   → Recorded in Binary Log: mysql-bin.000001, pos:658~820

2. Binlog Dump Thread: sends pos:658~820 events to Replica

3. Replica I/O Thread: writes received events to Relay Log

4. Replica SQL Thread: reads and executes events from Relay Log
   → INSERT INTO products VALUES('cherry')

5. Replica: updates Exec_Source_Log_Pos to 820
   → "Applied up to byte 820 of mysql-bin.000001"
```

You can check how far data has been read and applied with `SHOW REPLICA STATUS\G`.

```
Source_Log_File: mysql-bin.000001
Read_Source_Log_Pos: 820      ← position read by I/O Thread
Exec_Source_Log_Pos: 820      ← position applied by SQL Thread
```

## **4. File/Position's Limitation — The Fatal Problem Revealed During Failover**

The biggest limitation of the File/Position method is that **each server has an independent Binary Log coordinate system**.

Even for the same transaction, the filename and Position recorded in each server's Binary Log are completely different. An event at Source(A)'s `mysql-bin.000003:4500` might be at position `mysql-bin.000001:1200` in Replica(B)'s Binary Log. **There is no mapping relationship between these two coordinates.** This causes serious problems during Failover, which is covered in detail in Part 4.

---

# Part 3. GTID-Based Replication

## **1. Concept: Tracking Position with Globally Unique Transaction IDs**

GTID (Global Transaction Identifier) is a replication method introduced in MySQL 5.6 that assigns a **globally unique identifier** to every transaction.

```
GTID format = source_uuid:transaction_id

Example: 3E11FA47-71CA-11E1-9E33-C80AA9429562:23
         ├─────── server_uuid ───────────────┤ ├─ seq ─┤
```

`server_uuid` is a 128-bit unique value automatically generated when a MySQL server first starts, and `transaction_id` is a sequentially increasing number on that server. Therefore, no two transactions in the entire replication topology can have the same GTID.

## **2. GTID's Core Mechanism: Executed_Gtid_Set**

Every MySQL server maintains the **set of all GTIDs it has executed so far**. This is the `Executed_Gtid_Set`.

```sql
SHOW BINARY LOG STATUS\G
```

```
Executed_Gtid_Set: 3E11FA47-71CA-11E1:1-42,
                   7B22CC90-81AA-22E2:1-5
```

The above result means this server has executed all transactions 1-42 from UUID `3E11FA47` and transactions 1-5 from UUID `7B22CC90`.

## **3. Auto-Positioning: Automatic Synchronization Without Filename or Position**

The key feature of the GTID method is **Auto-Positioning**. When a Replica connects to a Source, it sends its `Executed_Gtid_Set`. The Source compares this with its own `Executed_Gtid_Set` and automatically sends only the transactions that the Replica is missing.

```
Replica's Executed_Gtid_Set: {UUID-A:1-42}
Source's  Executed_Gtid_Set: {UUID-A:1-50}

→ Source auto-calculates: UUID-A:43~50 are missing
→ Sends only those transactions
```

No filename or Position is needed in this process at all.

> **The Fundamental Difference from File/Position 🧐**
>
> File/Position is a **"server-local coordinate system."** The coordinate `mysql-bin.000001:658` only has meaning on that specific server and cannot be mapped to another server's coordinates. In contrast, GTID is a **"global coordinate system."** The GTID `3E11FA47:42` means the same transaction on any server. This is what makes the decisive difference during Failover.

## **4. Replication Setup Process**

**my.cnf configuration (both Source and Replica)**

```ini
[mysqld]
log-bin=mysql-bin
server-id=1                       # different value for each server
gtid_mode=ON                      # ★ enable GTID
enforce_gtid_consistency=ON       # ★ ensure GTID safety
```

`enforce_gtid_consistency=ON` blocks SQL that is incompatible with GTID. Most notably, `CREATE TABLE ... SELECT` is blocked because this statement mixes DDL (table creation) and DML (data insertion) in a single statement, which cannot be represented by a single GTID.

**Replica side: Start replication**

```sql
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='source-server',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_AUTO_POSITION=1;          -- ★ just specify this and you're done!

START REPLICA;
```

Compared to the File/Position method, `SOURCE_LOG_FILE` and `SOURCE_LOG_POS` are gone. With just `SOURCE_AUTO_POSITION=1`, the Replica automatically begins synchronization based on its own `Executed_Gtid_Set`.

## **5. GTID Replication Operation Flow**

```
1. Source: INSERT INTO products VALUES('cherry')
   → GTID assigned: 3E11FA47:43
   → Recorded in Binary Log

2. Binlog Dump Thread: sends GTID 3E11FA47:43 event to Replica

3. Replica I/O Thread: receives → writes to Relay Log

4. Replica SQL Thread: executes and adds to Executed_Gtid_Set
   → Executed_Gtid_Set: {3E11FA47:1-43}

5. Replica: "Applied up to 3E11FA47 number 43"
```

## **6. GTID Constraints**

- GTID-unsafe statements like `CREATE TABLE ... SELECT` are blocked
- Requires MySQL 5.6+ (5.7+ recommended for stable use)
- All servers in the topology must have `gtid_mode=ON`
- Online transition requires a step-by-step change: `OFF → OFF_PERMISSIVE → ON_PERMISSIVE → ON`

---

# Part 4. Failover Scenario Comparison — The Decisive Moment of Difference

The fundamental difference between the two methods becomes starkly apparent in **the process of switching a Replica to a new Source during a Source failure**. We assume the same topology with the same failure.

```
Normal state:
  Source(A) ──→ Replica(B)
            └─→ Replica(C)

Failure occurs:
  Source(A) DOWN! 💥
  → Promote Replica(B) as new Source
  → Connect Replica(C) to new Source(B)
```

## **1. File/Position Failover**

```
Step 1. Source(A) DOWN! → B and C's I/O Threads disconnect

Step 2. Promote Replica(B) as new Source
        STOP REPLICA;
        RESET REPLICA ALL;

Step 3. ★ The core problem occurs!
        C's last coordinates: A's mysql-bin.000003:4500
        B's current coordinates: B's mysql-bin.000001:1200
        → Completely different coordinate systems!
        → No way to know what Position in B corresponds to A's pos:4500!

Step 4. Work the administrator must do manually:
        a) Parse A's binlog with the mysqlbinlog tool
        b) Identify the last event at A's pos:4500
        c) Find the same event in B's binlog and confirm the Position
        d) Set that Position on C
        → Takes ~15-30+ minutes, high risk of human error

Step 5. (Assuming the Position was found)
        CHANGE REPLICATION SOURCE TO
          SOURCE_HOST='B',
          SOURCE_LOG_FILE='mysql-bin.000001',
          SOURCE_LOG_POS=1200;   -- ⚠️ no certainty this value is correct
        START REPLICA;
```

## **2. GTID Failover**

```
Step 1. Source(A) DOWN! → B and C's I/O Threads disconnect

Step 2. Promote Replica(B) as new Source
        STOP REPLICA;
        RESET REPLICA ALL;

Step 3. Execute on Replica(C) — just 3 lines!
        STOP REPLICA;
        CHANGE REPLICATION SOURCE TO
          SOURCE_HOST='B',
          SOURCE_AUTO_POSITION=1;   -- ★ that's it!
        START REPLICA;

Step 4. Internal operation:
        C sends its Executed_Gtid_Set to B
        → B automatically sends only the transactions C is missing
        → Replication resumes in ~10-30 seconds
```

## **3. Comparison Summary**

| Item                         | File/Position                                    | GTID                                    |
| ---------------------------- | ------------------------------------------------ | --------------------------------------- |
| **Position Tracking**        | Filename + byte offset                           | Globally unique ID (UUID:N)             |
| **Configuration Key**        | `SOURCE_LOG_FILE`, `SOURCE_LOG_POS`              | `SOURCE_AUTO_POSITION=1`                |
| **Key Failover Task**        | Manual coordinate recalculation with mysqlbinlog | Just change the hostname                |
| **Failover Recovery Time**   | 15-30+ minutes                                   | 10-30 seconds                           |
| **Human Error Risk**         | High (possible coordinate miscalculation)        | Low (automatic calculation)             |
| **Multi-Source Replication** | Manage coordinates per Source                    | Auto-distinguished by UUID              |
| **Skipping Transactions**    | `sql_slave_skip_counter`                         | `SET GTID_NEXT='uuid:N'`                |
| **SQL Constraints**          | None                                             | `CREATE TABLE...SELECT` etc. restricted |
| **Minimum Version**          | All versions                                     | 5.6+ (recommended 5.7+)                 |

---

# Part 5. Hands-On Failover with Docker

Theory alone makes it hard to truly feel the difference between the two methods. We'll build a `Source(A) → Replica(B), Replica(C)` topology with Docker, bring down Source(A), and perform Failover with both methods to experience the difference firsthand.

## **1. File/Position Failover Practice**

### Step 1. Environment Setup

```bash
# Create network
docker network create fp-net

# Create Source(A), Replica(B), Replica(C) containers
docker run -d --name fp-source-a --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name fp-replica-b --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name fp-replica-c --network fp-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql
```

### Step 2. my.cnf Configuration

Add to the `[mysqld]` section of `/etc/my.cnf` in each container.

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

# Restart all three
docker restart fp-source-a fp-replica-b fp-replica-c
```

### Step 3. Create Replication Account + Test Data on Source(A)

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

### Step 4. Data Dump + Apply to Replicas

```bash
# Dump Source data (--source-data includes binlog coordinates)
docker exec fp-source-a bash -c \
  "mysqldump -u root -p1234 --all-databases \
   --triggers --routines --events --source-data > /tmp/dump.sql"

# Copy and apply dump file
docker cp fp-source-a:/tmp/dump.sql ./fp-dump.sql
docker cp ./fp-dump.sql fp-replica-b:/tmp/dump.sql
docker cp ./fp-dump.sql fp-replica-c:/tmp/dump.sql
docker exec fp-replica-b bash -c "mysql -u root -p1234 < /tmp/dump.sql"
docker exec fp-replica-c bash -c "mysql -u root -p1234 < /tmp/dump.sql"
```

### Step 5. Start Replication on Replica(B) and (C)

Check the binlog coordinates included in the dump file.

```bash
docker exec fp-source-a mysql -u root -p1234 -e "SHOW BINARY LOG STATUS\G"
```

```
File: mysql-bin.000001
Position: 1890
```

Use the confirmed coordinates to set up replication on B and C.

```sql
-- Execute on B and C respectively
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='fp-source-a',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_LOG_FILE='mysql-bin.000001',  -- ★ manually specified filename
  SOURCE_LOG_POS=1890;                 -- ★ manually specified Position

START REPLICA;
```

### Step 6. 💥 Source(A) Failure!

```bash
docker stop fp-source-a
```

### Step 7. Promote Replica(B) as New Source

```bash
docker exec -it fp-replica-b mysql -u root -p1234
```

```sql
STOP REPLICA;
RESET REPLICA ALL;

-- Create replication account on B
CREATE USER 'repl'@'%' IDENTIFIED BY '1234';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- Check B's current binlog coordinates
SHOW BINARY LOG STATUS\G
```

```
File: mysql-bin.000001
Position: 876    ← completely different from A's Position (1890)!
```

### Step 8. ⚠️ Connect Replica(C) to New Source(B) — The Problem Emerges

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
  SOURCE_LOG_POS=876;   -- ⚠️ no certainty this value is correct!

START REPLICA;
SHOW REPLICA STATUS\G
```

> **The Feel Point 🧐**
>
> We used the Position from B's `SHOW BINARY LOG STATUS` directly, but there's no guarantee this is the position right after the last transaction C already applied. This is because `RESET REPLICA ALL`, `CREATE USER`, etc. executed during B's promotion were additionally recorded in B's binlog. To find the accurate Position, you'd need to parse B's binlog with the `mysqlbinlog` tool to find the event C last applied. This process can take 15-30+ minutes.

---

## **2. GTID Failover Practice**

Now let's build the same topology with GTID and perform Failover.

### Step 1. Environment Setup

```bash
docker network create gtid-net

docker run -d --name gtid-source-a --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name gtid-replica-b --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql

docker run -d --name gtid-replica-c --network gtid-net \
  -e MYSQL_ROOT_PASSWORD=1234 mysql
```

### Step 2. my.cnf Configuration — Enable GTID

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

### Step 3. Create Replication Account + Test Data on Source(A)

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

### Step 4. Data Dump + Apply to Replicas

```bash
docker exec gtid-source-a bash -c \
  "mysqldump -u root -p1234 --all-databases \
   --triggers --routines --events --set-gtid-purged=ON > /tmp/dump.sql"
```

> `--set-gtid-purged=ON` is the key here. It includes a `SET @@GLOBAL.GTID_PURGED='...'` statement in the dump file, so the Replica automatically knows where to start replicating from. This corresponds to `--source-data` in the File/Position method that includes binlog coordinates.

```bash
docker cp gtid-source-a:/tmp/dump.sql ./gtid-dump.sql
docker cp ./gtid-dump.sql gtid-replica-b:/tmp/dump.sql
docker cp ./gtid-dump.sql gtid-replica-c:/tmp/dump.sql
docker exec gtid-replica-b bash -c "mysql -u root -p1234 < /tmp/dump.sql"
docker exec gtid-replica-c bash -c "mysql -u root -p1234 < /tmp/dump.sql"
```

### Step 5. Start Replication on Replica(B) and (C)

```sql
-- Execute on B and C respectively
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='gtid-source-a',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_AUTO_POSITION=1;          -- ★ no filename or Position specified!

START REPLICA;
```

Compared to the File/Position method, `SOURCE_LOG_FILE` and `SOURCE_LOG_POS` have disappeared, replaced by just `SOURCE_AUTO_POSITION=1`.

### Step 6. Verify Normal Replication

```bash
# Insert additional data on Source(A)
docker exec gtid-source-a mysql -u root -p1234 -e \
  "INSERT INTO shopdb.products (name) VALUES ('date'), ('elderberry');"

# Verify on Replica(C)
docker exec gtid-replica-c mysql -u root -p1234 -e \
  "SELECT * FROM shopdb.products;"
```

If you see 5 rows (apple, banana, cherry, date, elderberry), replication is working normally.

### Step 7. 💥 Source(A) Failure!

```bash
docker stop gtid-source-a
```

### Step 8. Promote Replica(B) as New Source

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

### Step 9. ⚡ Switch Replica(C) to New Source(B) — Just 3 Lines!

```bash
docker exec -it gtid-replica-c mysql -u root -p1234
```

```sql
STOP REPLICA;

CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='gtid-replica-b',     -- ★ just change the host!
  SOURCE_USER='repl',
  SOURCE_PASSWORD='1234',
  SOURCE_AUTO_POSITION=1;           -- ★ no Position calculation needed!

START REPLICA;
SHOW REPLICA STATUS\G
```

```
Replica_IO_Running: Yes
Replica_SQL_Running: Yes
```

> 🎉 **That's it.** There was absolutely no need to calculate any Position.

### Step 10. Verification

```bash
# Add data on new Source(B)
docker exec gtid-replica-b mysql -u root -p1234 -e \
  "INSERT INTO shopdb.products (name) VALUES ('fig');"

# Verify on Replica(C)
docker exec gtid-replica-c mysql -u root -p1234 -e \
  "SELECT * FROM shopdb.products;"
```

If you see `fig`, the GTID-based Failover has been completely successful.

## **3. Troubleshooting You May Encounter During Practice**

You may encounter the following error during GTID Failover.

```
Last_IO_Error: Got fatal error 1236 from source when reading data from binary log:
'Cannot replicate because the source purged required binary logs containing GTIDs
that the replica requires.'
```

Or the SQL Thread may produce the following error.

```
Replica_SQL_Running: No
Last_Errno: 1410
Last_Error: Worker 1 failed executing transaction
'a7b30e60-1084-11f1-ae76-26b542c8e9fd:6'
```

**Root Cause Analysis**

Commands executed during B's promotion — `RESET REPLICA ALL`, `CREATE USER`, `GRANT`, etc. — generate new GTIDs with B's UUID. When C connects to B, B attempts to send these GTIDs to C. However, if these GTIDs conflict with data already on C (e.g., `CREATE USER 'repl'` already exists), or if C needs these GTIDs but they've already been purged from B's binlog, errors occur.

**Solution: Empty Transaction Injection**

You can mark these GTIDs as "already executed" on C to skip them.

```sql
STOP REPLICA;

-- Inject missing GTIDs as empty transactions
SET GTID_NEXT='a7b30e60-1084-11f1-ae76-26b542c8e9fd:1';
BEGIN; COMMIT;

SET GTID_NEXT='a7b30e60-1084-11f1-ae76-26b542c8e9fd:2';
BEGIN; COMMIT;

-- ... repeat for each missing number ...

SET GTID_NEXT='AUTOMATIC';  -- restore to automatic mode

START REPLICA;
SHOW REPLICA STATUS\G
```

> **GTID's Diagnostic Advantage 🧐**
>
> The error message explicitly states **exactly which GTID (`a7b30e60:6`) is the problem**. Therefore, you can resolve it by simply skipping that specific GTID. In the File/Position method, this level of diagnosis is simply impossible. To find out "which transaction is missing," you'd have to parse the binlog manually.

**Prevention in Production Environments**

- Pre-create replication accounts on Replica candidates designated for promotion, eliminating the need for `CREATE USER` during promotion
- Using automatic Failover solutions like MySQL Group Replication or InnoDB Cluster eliminates the need for manual work like empty transaction injection
- Leveraging replication management tools like Orchestrator can automate the entire Failover process

---

## Closing Thoughts (๑╹o╹)✎

Writing this post made me realize that what I casually thought of as "replication is just a matter of configuration" becomes a completely different problem during actual Failover scenarios. When I performed File/Position Failover with Docker, the anxiety of "is this value really correct?" while manually finding B's Position was significant, and the experience of completing the same task in just 3 lines with GTID right afterward left a strong impression.

The process of encountering and resolving the `Cannot replicate because the source purged required binary logs` error and the `Worker failed executing transaction` error during GTID Failover practice was also meaningful. I felt that the decisive difference from File/Position is that because the error message provides the exact GTID, it can be resolved with empty transaction injection.

If anything is incorrect, please let me know in the comments. 🙇🏻‍♀️

## References

- [MySQL 8.4 Reference Manual — Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html)
- [MySQL 8.4 Reference Manual — GTID Concepts](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids-concepts.html)
- [MySQL 8.4 Reference Manual — Replication with GTIDs](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids.html)
- [MySQL 8.4 Reference Manual — Binary Log](https://dev.mysql.com/doc/refman/8.4/en/binary-log.html)
- [MySQL 8.4 Reference Manual — InnoDB and MySQL Replication](https://dev.mysql.com/doc/refman/8.4/en/innodb-and-mysql-replication.html)
- [MySQL Replication Lecture Notes — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/replication/mysql-replication-overview)
- [MySQL Replication Practice Lecture Notes — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/replication/practice)
- [Transaction Isolation Level Lecture Notes — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/transaction/10.isolation-level)
- [MySQL Engine Architecture Lecture Notes — baceru.vercel.app](https://baceru.vercel.app/Archive/14.Database/transaction/11.mysql-engines)
