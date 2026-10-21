import json
import os
from decimal import Decimal
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal
from backend.app.models import (
    Departamento, Subregion, Municipio, InstitucionEducativa, SedeEducativa,
    Capitulo, Actividad, Insumo, PrecioInsumo, APU, APUComponente,
    AnalisisIndirecto, ParametroPrestacional, PolizaRango,
    ProyectoObra, ProyectoSede, Presupuesto, PresupuestoItem, Usuario, AuditoriaCambio
)

def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def export_static_data():
    db: Session = SessionLocal()
    out_dirs = [os.path.join("data"), os.path.join("frontend", "data")]
    for d in out_dirs:
        os.makedirs(d, exist_ok=True)

    def write_json(filename, data):
        for d in out_dirs:
            with open(os.path.join(d, filename), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2, default=decimal_default)

    print("Exporting static data for GitHub Pages and Standalone mode...")

    # 1. Territory
    subregiones = db.query(Subregion).all()
    territory_data = {
        "departamento": {"codigo_dane": "17", "nombre": "Caldas"},
        "subregiones": [
            {
                "id": s.id,
                "codigo": s.codigo,
                "nombre": s.nombre,
                "municipios": [
                    {
                        "id": m.id,
                        "codigo_dane": m.codigo_dane,
                        "nombre": m.nombre,
                        "instituciones": [
                            {
                                "id": ie.id,
                                "codigo_oficial": ie.codigo_oficial,
                                "nombre": ie.nombre,
                                "rector": ie.rector,
                                "estado": ie.estado,
                                "sedes": [
                                    {
                                        "id": sd.id,
                                        "codigo_dane": sd.codigo_dane,
                                        "nombre": sd.nombre,
                                        "direccion_vereda": sd.direccion_vereda,
                                        "zona": sd.zona,
                                        "estado": sd.estado
                                    }
                                    for sd in ie.sedes
                                ]
                            }
                            for ie in m.instituciones
                        ]
                    }
                    for m in s.municipios
                ]
            }
            for s in subregiones
        ]
    }
    write_json("territory.json", territory_data)

    # 2. Capitulos
    capitulos = db.query(Capitulo).order_by(Capitulo.orden).all()
    caps_data = [
        {"id": c.id, "codigo": c.codigo, "descripcion": c.descripcion, "categoria": c.categoria, "orden": c.orden}
        for c in capitulos
    ]
    write_json("capitulos.json", caps_data)

    # 3. Actividades
    actividades = db.query(Actividad).order_by(Actividad.codigo).all()
    acts_data = [
        {
            "id": a.id,
            "codigo": a.codigo,
            "descripcion": a.descripcion,
            "categoria": a.categoria,
            "unidad": a.unidad,
            "precio_referencia": float(a.precio_referencia or 0)
        }
        for a in actividades
    ]
    write_json("actividades.json", acts_data)

    # 4. APUs
    apus = db.query(APU).all()
    apus_data = []
    for ap in apus:
        comps = []
        for c in ap.componentes:
            cod_rec = c.insumo.codigo if c.insumo else (c.apu_hijo.actividad.codigo if c.apu_hijo else "")
            desc_rec = c.insumo.descripcion if c.insumo else (c.apu_hijo.actividad.descripcion if c.apu_hijo else "")
            und_rec = c.insumo.unidad if c.insumo else (c.apu_hijo.actividad.unidad if c.apu_hijo else "UND")
            comps.append({
                "id": c.id,
                "tipo_componente": c.tipo_componente,
                "codigo": cod_rec,
                "descripcion": desc_rec,
                "unidad": und_rec,
                "rendimiento": float(c.rendimiento),
                "precio_aplicado": float(c.precio_aplicado),
                "costo_parcial": float(c.costo_parcial)
            })

        apus_data.append({
            "id": ap.id,
            "actividad_id": ap.actividad_id,
            "codigo": ap.actividad.codigo,
            "descripcion": ap.actividad.descripcion,
            "categoria": ap.actividad.categoria,
            "unidad": ap.actividad.unidad,
            "version": ap.version,
            "costo_directo_total": float(ap.costo_directo_total),
            "componentes": comps
        })
    write_json("apus.json", apus_data)

    # 5. Insumos
    insumos = db.query(Insumo).all()
    ins_data = []
    for i in insumos:
        p26 = next((p.precio_unitario for p in i.precios if p.vigencia == 2026), 0)
        p25 = next((p.precio_unitario for p in i.precios if p.vigencia == 2025), 0)
        ins_data.append({
            "id": i.id,
            "codigo": i.codigo,
            "descripcion": i.descripcion,
            "tipo": i.tipo,
            "unidad": i.unidad,
            "fuente": i.fuente,
            "observaciones": i.observaciones,
            "precio_2026": float(p26 or 0),
            "precio_2025": float(p25 or 0)
        })
    write_json("insumos.json", ins_data)

    # 6. Parameters (AIU, Prestacionales, Polizas)
    aiu_items = db.query(AnalisisIndirecto).filter(AnalisisIndirecto.presupuesto_id == None).all()
    prest_items = db.query(ParametroPrestacional).all()
    pol_items = db.query(PolizaRango).all()
    parameters_data = {
        "aiu": [
            {
                "id": it.id,
                "capitulo_indirecto": it.capitulo_indirecto,
                "concepto": it.concepto,
                "unidad": it.unidad,
                "cantidad": float(it.cantidad),
                "dedicacion": float(it.dedicacion),
                "valor_unitario": float(it.valor_unitario),
                "factor_prestacional_aiu": float(it.factor_prestacional_aiu),
                "valor_total": float(it.valor_total)
            }
            for it in aiu_items
        ],
        "prestacionales": [
            {
                "id": it.id,
                "concepto": it.concepto,
                "categoria": it.categoria,
                "riesgo": it.riesgo,
                "rango_salarial": it.rango_salarial,
                "valor": float(it.valor),
                "vigencia": it.vigencia,
                "fuente": it.fuente
            }
            for it in prest_items
        ],
        "polizas": [
            {
                "id": it.id,
                "tipo_poliza": it.tipo_poliza,
                "limite_inferior": float(it.limite_inferior),
                "limite_superior": float(it.limite_superior) if it.limite_superior else None,
                "cobertura_smmlv": float(it.cobertura_smmlv),
                "tarifa_valor": float(it.tarifa_valor),
                "tarifa_fija": float(it.tarifa_fija),
                "vigencia": it.vigencia,
                "fuente": it.fuente
            }
            for it in pol_items
        ]
    }
    write_json("parameters.json", parameters_data)

    # 7. Projects & Budgets
    proys = db.query(ProyectoObra).all()
    proys_data = []
    for p in proys:
        sedes_links = [
            {
                "sede_id": ps.sede.id,
                "codigo_dane": ps.sede.codigo_dane,
                "nombre": ps.sede.nombre,
                "institucion": ps.sede.institucion.nombre,
                "municipio": ps.sede.municipio.nombre,
                "zona": ps.sede.zona,
                "alcance_sede": ps.alcance_sede
            }
            for ps in p.sedes_asociadas
        ]

        budgets_list = []
        for b in p.presupuestos:
            # Group items by chapter
            cap_map = {}
            for it in sorted(b.items, key=lambda x: (x.capitulo.orden, x.orden)):
                cid = it.capitulo_id
                if cid not in cap_map:
                    cap_map[cid] = {
                        "capitulo_id": cid,
                        "codigo": it.capitulo.codigo,
                        "descripcion": it.capitulo.descripcion,
                        "subtotal_capitulo": 0.0,
                        "items": []
                    }
                sub = float(it.subtotal)
                cap_map[cid]["subtotal_capitulo"] += sub
                cap_map[cid]["items"].append({
                    "id": it.id,
                    "item_num": it.item_num or f"{it.capitulo.codigo}.{it.orden}",
                    "actividad_id": it.actividad_id,
                    "actividad_codigo": it.actividad.codigo,
                    "actividad_desc": it.actividad.descripcion,
                    "unidad": it.actividad.unidad,
                    "cantidad": float(it.cantidad),
                    "precio_unitario": float(it.precio_unitario),
                    "subtotal": sub,
                    "orden": it.orden,
                    "observaciones": it.observaciones
                })

            budgets_list.append({
                "id": b.id,
                "proyecto_id": p.id,
                "proyecto_codigo": p.codigo,
                "proyecto_nombre": p.nombre,
                "version": b.version,
                "vigencia": b.vigencia,
                "estado": b.estado,
                "costo_directo": float(b.costo_directo),
                "costo_indirecto": float(b.costo_indirecto),
                "porcentaje_aiu": float(b.porcentaje_aiu or 0.25),
                "valor_total": float(b.valor_total),
                "moneda": b.moneda,
                "observaciones": b.observaciones,
                "aprobado_por": b.aprobado_por,
                "fecha_aprobacion": b.fecha_aprobacion.isoformat() if b.fecha_aprobacion else None,
                "capitulos": list(cap_map.values())
            })

        proys_data.append({
            "id": p.id,
            "codigo": p.codigo,
            "nombre": p.nombre,
            "tipo_intervencion": p.tipo_intervencion,
            "objeto": p.objeto,
            "estado": p.estado,
            "responsable": p.responsable,
            "fuente_financiacion": p.fuente_financiacion,
            "fecha_inicio": p.fecha_inicio.isoformat() if p.fecha_inicio else None,
            "fecha_fin": p.fecha_fin.isoformat() if p.fecha_fin else None,
            "sedes": sedes_links,
            "presupuestos": budgets_list
        })

    write_json("projects.json", proys_data)

    # 8. Audit Logs
    audit_logs = db.query(AuditoriaCambio).order_by(AuditoriaCambio.id.desc()).all()
    audit_data = [
        {
            "id": a.id,
            "usuario": a.usuario,
            "rol": a.rol,
            "entidad": a.entidad,
            "registro_id": a.registro_id,
            "campo": a.campo,
            "valor_anterior": a.valor_anterior,
            "valor_nuevo": a.valor_nuevo,
            "motivo": a.motivo,
            "fecha": a.fecha.isoformat()
        }
        for a in audit_logs
    ]
    write_json("audit.json", audit_data)

    db.close()
    print("Static data exported successfully to frontend/data/")

if __name__ == "__main__":
    export_static_data()
