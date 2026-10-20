from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import AnalisisIndirecto, ParametroPrestacional, PolizaRango
from backend.app.services.audit import log_change

router = APIRouter(prefix="/parameters", tags=["Parámetros AIU, Laborales y Pólizas"])

@router.get("/aiu")
def get_aiu_parameters(db: Session = Depends(get_db)):
    """Obtiene los conceptos configurados para el análisis de AIU / indirectos."""
    items = db.query(AnalisisIndirecto).filter(AnalisisIndirecto.presupuesto_id == None).all()
    results = []
    for it in items:
        results.append({
            "id": it.id,
            "capitulo_indirecto": it.capitulo_indirecto,
            "concepto": it.concepto,
            "unidad": it.unidad,
            "cantidad": float(it.cantidad),
            "dedicacion": float(it.dedicacion),
            "valor_unitario": float(it.valor_unitario),
            "factor_prestacional_aiu": float(it.factor_prestacional_aiu),
            "valor_total": float(it.valor_total)
        })
    return results

@router.get("/prestacionales")
def get_prestacional_parameters(db: Session = Depends(get_db)):
    """Obtiene factores prestacionales legales vigentes."""
    items = db.query(ParametroPrestacional).all()
    results = []
    for it in items:
        results.append({
            "id": it.id,
            "concepto": it.concepto,
            "categoria": it.categoria,
            "riesgo": it.riesgo,
            "rango_salarial": it.rango_salarial,
            "valor": float(it.valor),
            "vigencia": it.vigencia,
            "fuente": it.fuente
        })
    return results

@router.get("/polizas")
def get_polizas_parameters(db: Session = Depends(get_db)):
    """Obtiene los rangos de cobertura y primas de pólizas contractuales."""
    items = db.query(PolizaRango).all()
    results = []
    for it in items:
        results.append({
            "id": it.id,
            "tipo_poliza": it.tipo_poliza,
            "limite_inferior": float(it.limite_inferior),
            "limite_superior": float(it.limite_superior) if it.limite_superior else None,
            "cobertura_smmlv": float(it.cobertura_smmlv),
            "tarifa_valor": float(it.tarifa_valor),
            "tarifa_fija": float(it.tarifa_fija),
            "vigencia": it.vigencia,
            "fuente": it.fuente
        })
    return results
