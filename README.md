# 🚀 queuectl — CLI-Based Background Job Queue System

queuectl is a Node.js CLI application that manages background jobs with multiple worker processes, automatic retries using exponential backoff, and a Dead Letter Queue (DLQ) for failed jobs.

This project simulates a minimal, production-like job queue system similar to Celery or BullMQ — but implemented completely from scratch using Node.js and SQLite.

## 🧩 1. Setup Instructions
### Prerequisites

Node.js ≥ 18.17

npm (comes with Node)

Git (for cloning)

### Steps to Run Locally
#### 1️⃣ Clone the repository from GitHub
git clone https://github.com/<your-username>/queuectl.git

cd queuectl

#### 2️⃣ Install all required dependencies
npm install

#### 3️⃣ Create the required data folder structure
mkdir -p data/logs

mkdir -p data/workers

#### 4️⃣ Link the CLI globally so you can run 'queuectl' anywhere
npm link

#### 5️⃣ Verify installation
queuectl --help
Open in VS Code

### Open VS Code

1. Click File → Open Folder → select the cloned queuectl folder

2. Open the integrated terminal (Ctrl + ` or Terminal → New Terminal)

3. Run commands like:

   queuectl worker start --count 2
   
   queuectl enqueue '{"command":"echo Hello"}' --id job-ok
   
   queuectl status

## ⚙️ 2. Usage Examples
### Start Workers
queuectl worker start --count 2

Starts two background worker processes.

### Enqueue a Job
queuectl enqueue '{"command":"echo Hello"}' --id job-ok


#### Output:

{

  "id": "job-ok",
  
  "state": "pending",
  
  "attempts": 0,
  
  "max_retries": 3,
  
  "created_at": "2025-11-08T10:30:00Z"
  
}

### Check System Status
queuectl status


#### Output:

┌───────────┬───────┐

│ pending   │ 0     │

│ completed │ 1     │

│ failed    │ 0     │

│ dead      │ 0     │

└───────────┴───────┘

Active workers: 2

### View Job Logs
queuectl logs job-ok


#### Output:

Hello


### Handle Dead Letter Queue

List jobs that permanently failed:

queuectl dlq list

Retry a dead job:

queuectl dlq retry job-bad

### Configuration
queuectl config list

queuectl config set backoff-base 3

queuectl config get max-retries

### Stop Workers
queuectl worker stop

## 🏗️ 3. Architecture Overview
### Core Components
| Component               | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **CLI (`queuectl`)**    | Command-line interface to enqueue jobs, start/stop workers, manage DLQ, and view status.                     |
| **Database (SQLite)**   | Stores job metadata, state transitions, retries, timestamps, and worker records. Persistent across restarts. |
| **Workers**             | Background processes that pick pending jobs atomically and execute their commands.                           |
| **Executor**            | Runs the actual shell command using `child_process.exec` and captures stdout/stderr.                         |
| **Logger**              | Writes job output logs to `data/logs/<job-id>.log`.                                                          |
| **Configuration Store** | Stores retry and backoff parameters in SQLite for dynamic runtime changes.                                   |

### Jod Lifecycle

            ┌─────────────┐
            │   pending   │
            └──────┬──────┘
                   │
                   ▼
           ┌──────────────┐
           │  processing  │
           └──────┬───────┘
           │Success│Failure
           ▼       ▼
      ┌──────────┐ ┌──────────┐
      │completed │ │  failed  │
      └──────────┘ └────┬─────┘
                        │ Retries exhausted
                        ▼
                   ┌──────────┐
                   │   dead   │ ← moved to DLQ
                   └──────────┘
### Data Persistence

SQLite database: data/queue.db

Job logs: data/logs/<job-id>.log

Worker PIDs: data/workers/<pid>.pid

Using WAL mode ensures safe concurrent access by multiple worker processes.

### Worker Logic

1. Polls the DB for a pending job (state = 'pending' or 'failed' and run_at <= now).

2. Atomically claims a job (UPDATE ... RETURNING).

3. Executes its command.

4. If success → mark completed.
   
   If failure → increment attempts, compute next_run = base^attempts, reschedule.
   
   If attempts exceed max_retries → mark dead (DLQ).

5. Waits for the configured polling interval and repeats.

## ⚖️ 4. Assumptions & Trade-offs
| Category                | Decision                                       | Reasoning                                                             |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Database**            | Used SQLite                                    | Simple, file-based, concurrent-safe with WAL; no server setup needed. |
| **CLI-first design**    | All operations via CLI                         | Keeps project lightweight and focused.                                |
| **Exponential Backoff** | `delay = base^attempts` (configurable)         | Simple, proven retry strategy to reduce overload.                     |
| **Atomic Job Claiming** | SQL `UPDATE ... RETURNING`                     | Prevents two workers from picking the same job.                       |
| **Concurrency Model**   | Multiple OS processes                          | Easy parallelization and fault isolation.                             |
## 🧪 5. Testing Instructions
Manual Testing
#### 1️⃣ Start 2 workers
queuectl worker start --count 2

#### 2️⃣ Enqueue jobs
queuectl enqueue '{"command":"echo Success"}' --id job-ok

queuectl enqueue '{"command":"invalid_cmd"}' --id job-bad --max-retries 2

#### 3️⃣ Wait a few seconds and check
queuectl status

#### 4️⃣ View logs
queuectl logs job-ok

queuectl logs job-bad

#### 5️⃣ Check DLQ
queuectl dlq list

queuectl dlq retry job-bad
## 📦 Project Structure
<img width="686" height="563" alt="image" src="https://github.com/user-attachments/assets/44f8b82f-8462-4b8e-823f-c147bd45406d" />

