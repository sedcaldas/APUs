import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.app.config import settings
from backend.app.routers import (
    territory, projects, budgets, apus, insumos, parameters, bulk, reports, audit
)

app = FastAPI(
    title="Sistema de Presupuesto Infraestructura Educativa Caldas",
    description="Aplicación web integral para formulación, administración, comparación y auditoría de presupuestos de obra pública educativa en el departamento de Caldas.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(territory.router, prefix=settings.API_V1_STR)
app.include_router(projects.router, prefix=settings.API_V1_STR)
app.include_router(budgets.router, prefix=settings.API_V1_STR)
app.include_router(apus.router, prefix=settings.API_V1_STR)
app.include_router(insumos.router, prefix=settings.API_V1_STR)
app.include_router(parameters.router, prefix=settings.API_V1_STR)
app.include_router(bulk.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "system": "Presupuestos Obras Caldas",
        "vigencia": 2026,
        "database": "caldas_presupuesto.db"
    }

# Mount static frontend files if folder exists
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/")
    def serve_frontend():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Frontend en construcción", "docs": "/api/docs"}
