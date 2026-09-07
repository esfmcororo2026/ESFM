-- SCRIPT DE CREACIÓN DE ÍNDICES PARA TURSO DB
-- Proyecto: ESFM 2026
-- Objetivo: Reducir lecturas de filas (Rows Read) mediante búsquedas por índice B-Tree (SEARCH TABLE USING INDEX)

-- 1. Usuarios (Autenticación e inicios de sesión)
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_ci ON usuarios(ci);

-- 2. Estudiantes (Búsquedas frecuentes por especialidad, año y código)
CREATE INDEX IF NOT EXISTS idx_estudiantes_esp_anio ON estudiantes(especialidad, anio_formacion);
CREATE INDEX IF NOT EXISTS idx_estudiantes_codigo ON estudiantes(codigo_unico);
CREATE INDEX IF NOT EXISTS idx_estudiantes_dni ON estudiantes(dni);

-- 3. Asistencia Estudiantes (Filtros por docente, fecha y estudiante)
CREATE INDEX IF NOT EXISTS idx_asistencia_est_docente_fecha ON asistencia_estudiantes(docente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_est_estudiante ON asistencia_estudiantes(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_asistencia_est_esp_anio ON asistencia_estudiantes(especialidad, anio_formacion);

-- 4. Horarios y Materias
CREATE INDEX IF NOT EXISTS idx_horarios_esp_anio ON horarios(especialidad, anio_formacion);
CREATE INDEX IF NOT EXISTS idx_horarios_docente ON horarios(docente_id);
CREATE INDEX IF NOT EXISTS idx_materias_esp_anio ON materias(especialidad, anio_formacion);

-- 5. Ruleta y Participaciones
CREATE INDEX IF NOT EXISTS idx_participaciones_sesion ON participaciones(sesion_id);
CREATE INDEX IF NOT EXISTS idx_participaciones_estudiante ON participaciones(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_ruleta_docente ON ruleta_sesiones(docente_id);

-- 6. Administrativos
CREATE INDEX IF NOT EXISTS idx_administrativos_codigo ON administrativos(codigo_unico);
CREATE INDEX IF NOT EXISTS idx_administrativos_dni ON administrativos(dni);

-- 7. Eventos y Asistencias Generales
CREATE INDEX IF NOT EXISTS idx_eventos_activo ON eventos(activo);
CREATE INDEX IF NOT EXISTS idx_asistencias_evento ON asistencias(evento_id, estudiante_id);
