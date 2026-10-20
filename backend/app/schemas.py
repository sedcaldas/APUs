from decimal import Decimal
from typing import List, Optional, Any, Dict
from datetime import date, datetime
from pydantic import BaseModel, Field

# --- TERRITORIO ---
class DepartamentoBase(BaseModel):
    codigo_dane: str
    nombre: str

class DepartamentoRead(DepartamentoBase):
    id: int
    class Config:
        from_attributes = True

class SubregionBase(BaseModel):
    codigo: str
    nombre: str
    departamento_id: int

class SubregionRead(SubregionBase):
    id: int
    class Config:
        from_attributes = True

class MunicipioBase(BaseModel):
    codigo_dane: str
    nombre: str
    subregion_id: int

class MunicipioRead(MunicipioBase):
    id: int
    class Config:
        from_attributes = True

class InstitucionEducativaBase(BaseModel):
    codigo_oficial: str
    nombre: str
    municipio_id: int
    rector: Optional[str] = None
    estado: Optional[str] = "Activo"

class InstitucionEducativaRead(InstitucionEducativaBase):
    id: int
    class Config:
        from_attributes = True

class SedeEducativaBase(BaseModel):
    codigo_dane: str
    nombre: str
    institucion_id: int
    municipio_id: int
    direccion_vereda: Optional[str] = None
    zona: Optional[str] = "Urbana"
    estado: Optional[str] = "Activa"

class SedeEducativaRead(SedeEducativaBase):
    id: int
    class Config:
        from_attributes = True


# --- PROYECTO & PRESUPUESTO ---
class ProyectoSedeLink(BaseModel):
    sede_id: int
    alcance_sede: Optional[str] = None

class ProyectoCreate(BaseModel):
    codigo: str
    nombre: str
    tipo_intervencion: str
    objeto: Optional[str] = None
    responsable: Optional[str] = None
    fuente_financiacion: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    sedes: Optional[List[ProyectoSedeLink]] = []

class ProyectoRead(BaseModel):
    id: int
    codigo: str
    nombre: str
    tipo_intervencion: str
    objeto: Optional[str] = None
    estado: str
    responsable: Optional[str] = None
    fuente_financiacion: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    created_at: Optional[datetime] = None
    sedes_count: Optional[int] = 0
    presupuestos_count: Optional[int] = 0
    class Config:
        from_attributes = True


# --- PRESUPUESTO ITEMS ---
class PresupuestoItemCreate(BaseModel):
    capitulo_id: int
    actividad_id: int
    item_num: Optional[str] = None
    cantidad: Decimal
    precio_unitario: Optional[Decimal] = None
    orden: Optional[int] = 1
    observaciones: Optional[str] = None

class PresupuestoItemUpdate(BaseModel):
    cantidad: Optional[Decimal] = None
    precio_unitario: Optional[Decimal] = None
    orden: Optional[int] = None
    observaciones: Optional[str] = None
    motivo_cambio: Optional[str] = "Ajuste presupuestal"

class PresupuestoItemRead(BaseModel):
    id: int
    presupuesto_id: int
    capitulo_id: int
    capitulo_codigo: Optional[str] = None
    capitulo_desc: Optional[str] = None
    actividad_id: int
    actividad_codigo: Optional[str] = None
    actividad_desc: Optional[str] = None
    actividad_unidad: Optional[str] = None
    item_num: Optional[str] = None
    cantidad: Decimal
    precio_unitario: Decimal
    subtotal: Decimal
    orden: int
    observaciones: Optional[str] = None
    class Config:
        from_attributes = True


class PresupuestoCreate(BaseModel):
    proyecto_id: int
    version: Optional[int] = 1
    vigencia: Optional[int] = 2026
    observaciones: Optional[str] = None

class PresupuestoRead(BaseModel):
    id: int
    proyecto_id: int
    proyecto_nombre: Optional[str] = None
    version: int
    vigencia: int
    estado: str
    costo_directo: Decimal
    costo_indirecto: Decimal
    porcentaje_aiu: Decimal
    valor_total: Decimal
    moneda: str
    observaciones: Optional[str] = None
    aprobado_por: Optional[str] = None
    fecha_aprobacion: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items_count: Optional[int] = 0
    class Config:
        from_attributes = True


# --- APU E INSUMOS ---
class InsumoBase(BaseModel):
    codigo: str
    descripcion: str
    tipo: str
    unidad: str
    fuente: Optional[str] = None
    observaciones: Optional[str] = None

class InsumoRead(InsumoBase):
    id: int
    precio_2026: Optional[Decimal] = None
    precio_2025: Optional[Decimal] = None
    class Config:
        from_attributes = True

class InsumoPriceUpdate(BaseModel):
    precio_unitario: Decimal
    vigencia: int = 2026
    fuente: Optional[str] = None
    motivo: Optional[str] = "Actualización de cotización"

class APUComponenteRead(BaseModel):
    id: int
    apu_id: int
    insumo_id: Optional[int] = None
    apu_hijo_id: Optional[int] = None
    tipo_componente: str
    recurso_codigo: Optional[str] = None
    recurso_descripcion: Optional[str] = None
    unidad: Optional[str] = None
    rendimiento: Decimal
    precio_aplicado: Decimal
    costo_parcial: Decimal
    class Config:
        from_attributes = True

class APURead(BaseModel):
    id: int
    actividad_id: int
    actividad_codigo: str
    actividad_descripcion: str
    unidad: Optional[str] = None
    version: int
    costo_directo_total: Decimal
    estado: str
    componentes: List[APUComponenteRead] = []
    class Config:
        from_attributes = True


# --- AUDITORIA ---
class AuditoriaRead(BaseModel):
    id: int
    usuario: str
    rol: str
    entidad: str
    registro_id: str
    campo: Optional[str] = None
    valor_anterior: Optional[str] = None
    valor_nuevo: Optional[str] = None
    motivo: Optional[str] = None
    fecha: datetime
    class Config:
        from_attributes = True


# --- IMPORTACIÓN MASIVA ---
class ImportValidationSummary(BaseModel):
    tipo: str
    modo: str
    total_filas: int
    validas: int
    errores_count: int
    nuevos: int
    actualizados: int
    sin_cambios: int
    errores_muestra: List[Dict[str, Any]] = []
    lote_id: Optional[int] = None
