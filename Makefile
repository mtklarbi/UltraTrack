.PHONY: run run-docker

run:
	python -m server.app

run-docker:
	docker build -t semdiff-api -f server/Dockerfile .
	docker run --rm -p 8000:8000 --env DATABASE_URL=sqlite:////data/semdiff.db -v $$PWD/data:/data semdiff-api

