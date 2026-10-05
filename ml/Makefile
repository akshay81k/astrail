.PHONY: setup test lint train evaluate clean

setup:
	python -m venv venv
	.\venv\Scripts\activate && pip install -e .[dev]

test:
	.\venv\Scripts\activate && pytest tests/

lint:
	.\venv\Scripts\activate && ruff check .
	.\venv\Scripts\activate && ruff format --check .

train:
	.\venv\Scripts\activate && python -m spacecraft_rca.train

evaluate:
	.\venv\Scripts\activate && python -m spacecraft_rca.evaluate

clean:
	rmdir /S /Q venv
	rmdir /S /Q .pytest_cache
	rmdir /S /Q src\spacecraft_rca.egg-info
