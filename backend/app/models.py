import datetime
from decimal import Decimal
from sqlalchemy import (
    Column, Integer, String, Text, Numeric, Boolean, Date, DateTime,
    ForeignKey, Table, UniqueConstraint, CheckConstraint
)
from sqlalchemy.orm import relationship
from backend.app.database import Base

# --- MODELO TERRITORIAL Y EDUCATIVO DE CALDAS ---

class Departamento(Base):
    __tablename__ = "departamento"

    id = Column(Integer, primary_key=True, index=True)
    codigo_dane = Column(String(2), unique=True, nullable=False, index=True) # '17' para Caldas
    nombre = Column(String(100), nullable=False)

    subregiones = relationship("Subregion", back_populates="departamento", cascade="all, delete-orphan")


class Subregion(Base):
    __tablename__ = "subregion"

    id = Column(Integer, primary_key=True, index=True)
    departamento_id = Column(Integer, ForeignKey("departamento.id"), nullable=False)
    codigo = Column(String(20), nullable=False)
    nombre = Column(String(100), nullable=False)

    departamento = relationship("Departamento", back_populates="subregiones")
    municipios = relationship("Municipio", back_populates="subregion", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("departamento_id", "codigo", name="uq_subregion_dep_codigo"),
    )


class Municipio(Base):
    __tablename__ = "municipio"

    id = Column(Integer, primary_key=True, index=True)
    subregion_id = Column(Integer, ForeignKey("subregion.id"), nullable=False)
    codigo_dane = Column(String(5), unique=True, nullable=False, index=True) # Ej: '17001'
    nombre = Column(String(100), nullable=False)

    subregion = relationship("Subregion", back_populates="municipios")
    instituciones = relationship("InstitucionEducativa", back_populates="municipio", cascade="all, delete-orphan")
    sedes = relationship("SedeEducativa", back_populates="municipio")


class InstitucionEducativa(Base):
    __tablename__ = "institucion_educativa"

    id = Column(Integer, primary_key=True, index=True)
    municipio_id = Column(Integer, ForeignKey("municipio.id"), nullable=False)
    codigo_oficial = Column(String(20), unique=True, nullable=False, index=True) # DANE 12 dígitos
    nombre = Column(String(255), nullable=False)
    rector = Column(String(150), nullable=True)
    estado = Column(String(30), default="Activo")

    municipio = relationship("Municipio", back_populates="instituciones")
    sedes = relationship("SedeEducativa", back_populates="institucion", cascade="all, delete-orphan")


class SedeEducativa(Base):
    __tablename__ = "sede_educativa"

    id = Column(Integer, primary_key=True, index=True)
    institucion_id = Column(Integer, ForeignKey("institucion_educativa.id"), nullable=False)
    municipio_id = Column(Integer, ForeignKey("municipio.id"), nullable=False)
    codigo_dane = Column(String(20), unique=True, nullable=False, index=True) # DANE Sede
    nombre = Column(String(255), nullable=False)
    direccion_vereda = Column(String(255), nullable=True)
    zona = Column(String(30), default="Urbana") # Urbana / Rural
    estado = Column(String(30), default="Activa")

    institucion = relationship("InstitucionEducativa", back_populates="sedes")
    municipio = relationship("Municipio", back_populates="sedes")
    proyectos_sedes = relationship("ProyectoSede", back_populates="sede")


# --- PROYECTO Y PRESUPUESTO ---

class ProyectoObra(Base):
    __tablename__ = "proyecto_obra"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)
    nombre = Column(String(255), nullable=False)
    tipo_intervencion = Column(String(100), nullable=False) # Construcción, Mantenimiento, Mejoramiento, Adecuación
    objeto = Column(Text, nullable=True)
    estado = Column(String(30), default="Borrador") # Borrador, En Revisión, Aprobado, En Ejecución, Cerrado
    responsable = Column(String(150), nullable=True)
    fuente_financiacion = Column(String(150), nullable=True) # SGP, Regalías, Recursos Propios Caldas, MEN
    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    sedes_asociadas = relationship("ProyectoSede", back_populates="proyecto", cascade="all, delete-orphan")
    presupuestos = relationship("Presupuesto", back_populates="proyecto", cascade="all, delete-orphan")


class ProyectoSede(Base):
    __tablename__ = "proyecto_sede"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyecto_obra.id"), nullable=False)
    sede_id = Column(Integer, ForeignKey("sede_educativa.id"), nullable=False)
    alcance_sede = Column(Text, nullable=True)

    proyecto = relationship("ProyectoObra", back_populates="sedes_asociadas")
    sede = relationship("SedeEducativa", back_populates="proyectos_sedes")

    __table_args__ = (
        UniqueConstraint("proyecto_id", "sede_id", name="uq_proyecto_sede"),
    )


class Presupuesto(Base):
    __tablename__ = "presupuesto"

    id = Column(Integer, primary_key=True, index=True)
    proyecto_id = Column(Integer, ForeignKey("proyecto_obra.id"), nullable=False)
    version = Column(Integer, default=1, nullable=False)
    vigencia = Column(Integer, default=2026, nullable=False)
    estado = Column(String(30), default="Borrador") # Borrador, En Revisión, Aprobado, Reemplazado
    costo_directo = Column(Numeric(18, 2), default=0.00, nullable=False)
    costo_indirecto = Column(Numeric(18, 2), default=0.00, nullable=False)
    porcentaje_aiu = Column(Numeric(8, 4), default=0.00) # Ej: 0.25 (25%)
    valor_total = Column(Numeric(18, 2), default=0.00, nullable=False)
    moneda = Column(String(10), default="COP")
    observaciones = Column(Text, nullable=True)
    aprobado_por = Column(String(150), nullable=True)
    fecha_aprobacion = Column(DateTime, nullable=True)
    snapshot_data = Column(Text, nullable=True) # JSON frozen snapshot when approved
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    proyecto = relationship("ProyectoObra", back_populates="presupuestos")
    items = relationship("PresupuestoItem", back_populates="presupuesto", cascade="all, delete-orphan")
    analisis_indirectos = relationship("AnalisisIndirecto", back_populates="presupuesto", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("proyecto_id", "version", name="uq_proyecto_version"),
    )


# --- ESTRUCTURA DE OBRA: CAPITULOS Y ACTIVIDADES ---

class Capitulo(Base):
    __tablename__ = "capitulo"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False, index=True) # Ej: '001', '002', 'AB'
    descripcion = Column(String(255), nullable=False)
    categoria = Column(String(50), default="Capitulo")
    orden = Column(Integer, default=1)

    items = relationship("PresupuestoItem", back_populates="capitulo")


class Actividad(Base):
    __tablename__ = "actividad"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(30), unique=True, nullable=False, index=True) # Ej: 'AB1', '00101'
    descripcion = Column(Text, nullable=False)
    categoria = Column(String(50), default="Actividad") # Basico, Actividad, Capitulo
    unidad = Column(String(20), nullable=True) # M2, M3, ML, UND, KG, etc.
    precio_referencia = Column(Numeric(18, 2), default=0.00) # VR. UNIT (CD)
    estado = Column(String(20), default="Activa")

    apus = relationship("APU", back_populates="actividad", cascade="all, delete-orphan")
    items = relationship("PresupuestoItem", back_populates="actividad")


class PresupuestoItem(Base):
    __tablename__ = "presupuesto_item"

    id = Column(Integer, primary_key=True, index=True)
    presupuesto_id = Column(Integer, ForeignKey("presupuesto.id"), nullable=False)
    capitulo_id = Column(Integer, ForeignKey("capitulo.id"), nullable=False)
    actividad_id = Column(Integer, ForeignKey("actividad.id"), nullable=False)
    item_num = Column(String(20), nullable=True) # Ej: '1.1', '2.3'
    cantidad = Column(Numeric(18, 4), default=0.0000, nullable=False)
    precio_unitario = Column(Numeric(18, 4), default=0.0000, nullable=False)
    subtotal = Column(Numeric(18, 2), default=0.00, nullable=False)
    orden = Column(Integer, default=1)
    observaciones = Column(Text, nullable=True)

    presupuesto = relationship("Presupuesto", back_populates="items")
    capitulo = relationship("Capitulo", back_populates="items")
    actividad = relationship("Actividad", back_populates="items")


# --- APU E INSUMOS ---

class Insumo(Base):
    __tablename__ = "insumo"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True) # Ej: 'I1', 'C1', 'H1'
    descripcion = Column(Text, nullable=False)
    tipo = Column(String(50), default="Insumos") # Insumos, Cuadrilla, Herramienta, Equipo, etc.
    unidad = Column(String(30), default="UND")
    fuente = Column(String(255), nullable=True)
    observaciones = Column(Text, nullable=True)

    precios = relationship("PrecioInsumo", back_populates="insumo", cascade="all, delete-orphan")
    componentes_usados = relationship("APUComponente", back_populates="insumo")


class PrecioInsumo(Base):
    __tablename__ = "precio_insumo"

    id = Column(Integer, primary_key=True, index=True)
    insumo_id = Column(Integer, ForeignKey("insumo.id"), nullable=False)
    vigencia = Column(Integer, default=2026, nullable=False)
    fecha_precio = Column(Date, nullable=True)
    precio_unitario = Column(Numeric(18, 4), default=0.0000, nullable=False)
    incluye_iva = Column(Boolean, default=True)
    fuente = Column(String(255), nullable=True)

    insumo = relationship("Insumo", back_populates="precios")

    __table_args__ = (
        UniqueConstraint("insumo_id", "vigencia", name="uq_insumo_vigencia"),
    )


class APU(Base):
    __tablename__ = "apu"

    id = Column(Integer, primary_key=True, index=True)
    actividad_id = Column(Integer, ForeignKey("actividad.id"), nullable=False)
    version = Column(Integer, default=1)
    vigencia_desde = Column(Date, nullable=True)
    costo_directo_total = Column(Numeric(18, 4), default=0.0000)
    estado = Column(String(20), default="Activo")

    actividad = relationship("Actividad", back_populates="apus")
    componentes = relationship("APUComponente", foreign_keys="[APUComponente.apu_id]", back_populates="apu", cascade="all, delete-orphan")


class APUComponente(Base):
    __tablename__ = "apu_componente"

    id = Column(Integer, primary_key=True, index=True)
    apu_id = Column(Integer, ForeignKey("apu.id"), nullable=False)
    insumo_id = Column(Integer, ForeignKey("insumo.id"), nullable=True) # Direct resource
    apu_hijo_id = Column(Integer, ForeignKey("apu.id"), nullable=True) # Nested basic APU
    tipo_componente = Column(String(50), nullable=False) # Insumos, Cuadrilla, Herramienta, Analisis Basico
    rendimiento = Column(Numeric(18, 6), default=1.000000, nullable=False)
    precio_aplicado = Column(Numeric(18, 4), default=0.0000, nullable=False)
    costo_parcial = Column(Numeric(18, 4), default=0.0000, nullable=False)

    apu = relationship("APU", foreign_keys=[apu_id], back_populates="componentes")
    insumo = relationship("Insumo", back_populates="componentes_usados")
    apu_hijo = relationship("APU", foreign_keys=[apu_hijo_id])

    __table_args__ = (
        CheckConstraint(
            "(insumo_id IS NOT NULL AND apu_hijo_id IS NULL) OR (insumo_id IS NULL AND apu_hijo_id IS NOT NULL)",
            name="chk_apu_componente_recurso_o_subapu"
        ),
    )


# --- COSTOS INDIRECTOS (AIU), MANO DE OBRA Y PARÁMETROS ---

class AnalisisIndirecto(Base):
    __tablename__ = "analisis_indirecto"

    id = Column(Integer, primary_key=True, index=True)
    presupuesto_id = Column(Integer, ForeignKey("presupuesto.id"), nullable=True) # NULL for default profile
    capitulo_indirecto = Column(String(100), nullable=False) # 1. GASTOS GENERALES, 2. GASTOS INDIRECTOS, etc.
    concepto = Column(String(255), nullable=False)
    unidad = Column(String(20), default="Mes")
    cantidad = Column(Numeric(18, 4), default=1.0000)
    dedicacion = Column(Numeric(12, 6), default=1.000000)
    valor_unitario = Column(Numeric(18, 4), default=0.0000)
    factor_prestacional_aiu = Column(Numeric(12, 6), default=0.000000)
    valor_total = Column(Numeric(18, 2), default=0.00)
    porcentaje_costo_directo = Column(Numeric(8, 4), default=0.0000)

    presupuesto = relationship("Presupuesto", back_populates="analisis_indirectos")


class ParametroPrestacional(Base):
    __tablename__ = "parametro_prestacional"

    id = Column(Integer, primary_key=True, index=True)
    concepto = Column(String(150), nullable=False)
    categoria = Column(String(100), default="Prestaciones Sociales")
    riesgo = Column(String(30), default="Alto") # Alto / Bajo
    rango_salarial = Column(String(50), default="1-2 SMMLV") # 1-2 SMMLV, >2 SMMLV
    valor = Column(Numeric(12, 6), nullable=False) # e.g. 0.0833
    vigencia = Column(Integer, default=2026)
    fuente = Column(String(255), nullable=True)


class PolizaRango(Base):
    __tablename__ = "poliza_rango"

    id = Column(Integer, primary_key=True, index=True)
    tipo_poliza = Column(String(100), nullable=False) # RCE, Cumplimiento, Anticipo, Estabilidad
    limite_inferior = Column(Numeric(18, 2), default=0.00)
    limite_superior = Column(Numeric(18, 2), nullable=True)
    cobertura_smmlv = Column(Numeric(18, 2), default=0.00)
    tarifa_valor = Column(Numeric(12, 6), default=0.000000)
    tarifa_fija = Column(Numeric(18, 2), default=0.00)
    vigencia = Column(Integer, default=2026)
    fuente = Column(String(255), nullable=True)


# --- AUDITORIA, IMPORTACIONES Y USUARIOS ---

class Usuario(Base):
    __tablename__ = "usuario"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    rol = Column(String(50), default="Formulador") # Administrador, Administrador de Costos, Formulador, Revisor, Aprobador, Consulta, Auditor
    activo = Column(Boolean, default=True)


class ImportacionLote(Base):
    __tablename__ = "importacion_lote"

    id = Column(Integer, primary_key=True, index=True)
    archivo_nombre = Column(String(255), nullable=False)
    archivo_hash = Column(String(64), nullable=True)
    tipo = Column(String(50), nullable=False) # Insumos, Cantidades, Precios, Actividades
    modo = Column(String(30), nullable=False) # crear, actualizar, sincronizar, validar
    estado = Column(String(30), default="Completado") # Validado, Aplicado, Fallido, Revertido
    total_filas = Column(Integer, default=0)
    filas_validas = Column(Integer, default=0)
    filas_errores = Column(Integer, default=0)
    usuario_nombre = Column(String(150), default="Sistema")
    fecha = Column(DateTime, default=datetime.datetime.utcnow)
    resumen_json = Column(Text, nullable=True)

    errores = relationship("ImportacionFilaError", back_populates="lote", cascade="all, delete-orphan")


class ImportacionFilaError(Base):
    __tablename__ = "importacion_fila_error"

    id = Column(Integer, primary_key=True, index=True)
    lote_id = Column(Integer, ForeignKey("importacion_lote.id"), nullable=False)
    numero_fila = Column(Integer, nullable=False)
    campo = Column(String(100), nullable=True)
    valor_recibido = Column(Text, nullable=True)
    descripcion_error = Column(Text, nullable=False)

    lote = relationship("ImportacionLote", back_populates="errores")


class AuditoriaCambio(Base):
    __tablename__ = "auditoria_cambio"

    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(150), default="Administrador")
    rol = Column(String(50), default="Administrador")
    entidad = Column(String(80), nullable=False) # PresupuestoItem, Insumo, Presupuesto, etc.
    registro_id = Column(String(80), nullable=False)
    campo = Column(String(80), nullable=True)
    valor_anterior = Column(Text, nullable=True)
    valor_nuevo = Column(Text, nullable=True)
    motivo = Column(Text, nullable=True)
    fecha = Column(DateTime, default=datetime.datetime.utcnow)
    lote_id = Column(Integer, ForeignKey("importacion_lote.id"), nullable=True)
