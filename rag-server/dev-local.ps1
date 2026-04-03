param(
	[switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
	throw "Missing .env at $envPath. Copy .env.example to .env first."
}

$loadedNames = New-Object System.Collections.Generic.List[string]

Get-Content -LiteralPath $envPath | ForEach-Object {
	$line = $_.Trim()
	if (-not $line -or $line.StartsWith("#")) {
		return
	}

	$separatorIndex = $line.IndexOf("=")
	if ($separatorIndex -lt 1) {
		throw "Invalid .env line: $line"
	}

	$name = $line.Substring(0, $separatorIndex).Trim()
	$value = $line.Substring($separatorIndex + 1)

	if (
		($value.StartsWith('"') -and $value.EndsWith('"')) -or
		($value.StartsWith("'") -and $value.EndsWith("'"))
	) {
		$value = $value.Substring(1, $value.Length - 2)
	}

	Set-Item -Path ("Env:" + $name) -Value $value
	$loadedNames.Add($name) | Out-Null
}

if (-not $env:GEMINI_API_KEY) {
	Write-Warning "GEMINI_API_KEY is blank. Query and full-sync requests that need embeddings will fail."
}

foreach ($requiredName in @("INTERNAL_QUERY_API_KEY", "INTERNAL_ADMIN_API_KEY")) {
	if (-not (Get-ChildItem ("Env:" + $requiredName) -ErrorAction SilentlyContinue)) {
		throw "Missing required variable $requiredName in .env"
	}
}

Write-Host ("Loaded .env variables: " + ($loadedNames -join ", "))

if ($ValidateOnly) {
	return
}

& (Join-Path $PSScriptRoot "gradlew.bat") bootRun
