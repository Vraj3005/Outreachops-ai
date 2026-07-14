# OutreachOps AI V2 Developer Commands Makefile

.PHONY: install dev test lint format typecheck frontend-build backend-start worker-start

install:
	@echo "Installing backend dependencies..."
	cd backend && .venv\Scripts\pip.exe install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

dev:
	@echo "Starting development containers..."
	docker-compose up

test:
	@echo "Running backend test suite..."
	cd backend && .venv\Scripts\pytest.exe

lint:
	@echo "Linting backend with Ruff..."
	cd backend && .venv\Scripts\ruff.exe check .
	@echo "Linting frontend with Next lint..."
	cd frontend && npm run lint

format:
	@echo "Formatting backend with Black..."
	cd backend && .venv\Scripts\black.exe .

typecheck:
	@echo "Typechecking frontend with tsc..."
	cd frontend && npm run typecheck

frontend-build:
	@echo "Building frontend..."
	cd frontend && npm run build

backend-start:
	@echo "Starting FastAPI backend server..."
	cd backend && .venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

worker-start:
	@echo "Triggering offline queue dispatch runner..."
	cd backend && .venv\Scripts\python.exe -c "from app.routes.emails import process_approved_queue; process_approved_queue('d3b07384-d113-4ec2-a72d-86284f1837b2')"
