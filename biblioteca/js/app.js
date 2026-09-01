// ========== BIBLIOTECA ==========

let eventoActivoBib = null;

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) {
        // Si hay una sesión de portal de usuario activa en esta pestaña,
        // redirigir al portal de usuario en lugar del login raíz
        const portalUser = sessionStorage.getItem('esfm_portal_user');
        if (portalUser) {
            window.location.href = 'usuario.html';
        } else {
            window.location.href = '../index.html';
        }
        return;
    }
    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = user.nombre);
    document.querySelectorAll('.dropdown-rol').forEach(el => el.textContent = user.rol.toUpperCase());
    await tursodb.initializeData();
    await crearTablasBiblioteca();
});

async function crearTablasBiblioteca() {
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_eventos (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            fecha_inicio TEXT NOT NULL,
            fecha_fin TEXT NOT NULL,
            activo INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_visitas (
            id TEXT PRIMARY KEY,
            evento_id TEXT NOT NULL,
            persona_ci TEXT NOT NULL,
            persona_nombre TEXT NOT NULL,
            persona_tipo TEXT NOT NULL,
            persona_especialidad TEXT,
            persona_anio TEXT,
            persona_cargo TEXT,
            timestamp TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_libros (
            id TEXT PRIMARY KEY,
            area_cod TEXT NOT NULL,
            libro_num TEXT NOT NULL,
            titulo TEXT NOT NULL,
            autor TEXT,
            editorial TEXT,
            anio INTEGER,
            cantidad_total INTEGER DEFAULT 1,
            cantidad_disponible INTEGER DEFAULT 1,
            estado_fisico TEXT DEFAULT 'Bueno',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_ejemplares (
            id TEXT PRIMARY KEY,
            libro_id TEXT NOT NULL,
            codigo_ejemplar TEXT UNIQUE NOT NULL,
            ejemplar_num INTEGER NOT NULL,
            estado TEXT DEFAULT 'disponible',
            estado_fisico TEXT DEFAULT 'Bueno',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_prestamos (
            id TEXT PRIMARY KEY,
            persona_ci TEXT NOT NULL,
            persona_nombre TEXT NOT NULL,
            persona_tipo TEXT NOT NULL,
            fecha_prestamo TEXT NOT NULL,
            fecha_devolucion_prevista TEXT NOT NULL,
            fecha_devolucion_real TEXT,
            estado TEXT DEFAULT 'activo',
            observaciones TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_prestamo_detalles (
            id TEXT PRIMARY KEY,
            prestamo_id TEXT NOT NULL,
            libro_id TEXT NOT NULL,
            ejemplar_id TEXT,
            libro_codigo TEXT NOT NULL,
            libro_titulo TEXT NOT NULL,
            estado_item TEXT DEFAULT 'prestado',
            fecha_devolucion_item TEXT
        )
    `);
    try {
        await tursodb.query(`ALTER TABLE biblioteca_prestamo_detalles ADD COLUMN ejemplar_id TEXT`);
    } catch (e) { /* Columna ya existe */ }
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_reservas (
            id TEXT PRIMARY KEY,
            libro_id TEXT NOT NULL,
            ejemplar_id TEXT,
            persona_ci TEXT NOT NULL,
            persona_nombre TEXT NOT NULL,
            persona_tipo TEXT NOT NULL,
            estado TEXT DEFAULT 'pendiente',
            fecha_reserva TEXT DEFAULT CURRENT_TIMESTAMP,
            fecha_expiracion TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try { await tursodb.query(`ALTER TABLE biblioteca_reservas ADD COLUMN ejemplar_id TEXT`); } catch (e) {}
    try { await tursodb.query(`ALTER TABLE biblioteca_reservas ADD COLUMN fecha_expiracion TEXT`); } catch (e) {}
    try { await tursodb.query(`ALTER TABLE biblioteca_reservas ADD COLUMN libro_titulo TEXT`); } catch (e) {}
    try { await tursodb.query(`ALTER TABLE biblioteca_reservas ADD COLUMN libro_codigo TEXT`); } catch (e) {}

    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_proyectos (
            id TEXT PRIMARY KEY,
            cod_esp TEXT NOT NULL,
            gestion TEXT NOT NULL,
            proyecto_num TEXT NOT NULL,
            codigo_proyecto TEXT UNIQUE NOT NULL,
            titulo TEXT NOT NULL,
            especialidad TEXT,
            autores TEXT,
            modalidad TEXT,
            cantidad_total INTEGER DEFAULT 1,
            cantidad_disponible INTEGER DEFAULT 1,
            estado_fisico TEXT DEFAULT 'Bueno',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_proyectos_ejemplares (
            id TEXT PRIMARY KEY,
            proyecto_id TEXT NOT NULL,
            codigo_ejemplar TEXT UNIQUE NOT NULL,
            ejemplar_num INTEGER NOT NULL,
            estado TEXT DEFAULT 'disponible',
            estado_fisico TEXT DEFAULT 'Bueno',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try { await tursodb.query(`ALTER TABLE biblioteca_prestamo_detalles ADD COLUMN tipo_item TEXT DEFAULT 'libro'`); } catch (e) {}
    try { await tursodb.query(`ALTER TABLE biblioteca_reservas ADD COLUMN tipo_item TEXT DEFAULT 'libro'`); } catch (e) {}
    try { await tursodb.query(`ALTER TABLE biblioteca_proyectos ADD COLUMN modalidad TEXT`); } catch (e) {}
}

function toggleDropdown() {
    document.getElementById('user-dropdown-bib').classList.toggle('active');
}

document.addEventListener('click', function(e) {
    const d = document.getElementById('user-dropdown-bib');
    if (d && !d.contains(e.target)) d.classList.remove('active');
});

function cerrarSesion() {
    localStorage.removeItem('currentUser');
    window.location.href = '../index.html';
}

function volverDashboard() {
    sessionStorage.setItem('fromModule', '1');
    window.location.href = '../index.html';
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function showDashboardBib() { showSection('dashboard-biblioteca'); }

// ========== ESTADÍSTICA ==========

async function showEstadistica() {
    showSection('estadistica-section');
    await cargarMetricasEstadistica();
}

async function cargarMetricasEstadistica() {
    try {
        const eventoActivo = await obtenerEventoActivo();
        const elEvento = document.getElementById('kpi-evento-activo');
        if (elEvento) {
            elEvento.textContent = eventoActivo ? eventoActivo.nombre : 'Ninguno';
        }

        const hoy = new Date().toISOString().split('T')[0];
        let totalHoy = 0;
        if (eventoActivo) {
            const resHoy = await tursodb.query(
                `SELECT COUNT(*) as cant FROM biblioteca_visitas WHERE evento_id = ? AND timestamp LIKE ?`,
                [eventoActivo.id, `${hoy}%`]
            );
            if (resHoy.rows && resHoy.rows[0]) {
                totalHoy = resHoy.rows[0].cant || 0;
            }
        }
        const elVisitas = document.getElementById('kpi-visitas-hoy');
        if (elVisitas) elVisitas.textContent = totalHoy;

        const resEv = await tursodb.query(`SELECT COUNT(*) as cant FROM biblioteca_eventos`);
        let totalEventos = 0;
        if (resEv.rows && resEv.rows[0]) {
            totalEventos = resEv.rows[0].cant || 0;
        }
        const elTotalEv = document.getElementById('kpi-total-eventos');
        if (elTotalEv) elTotalEv.textContent = totalEventos;
    } catch (err) {
        console.error('Error cargando métricas de estadística:', err);
    }
}

// ========== EVENTOS ==========

async function showEventos() {
    showSection('eventos-section');
    await cargarListaEventos();
}

async function crearEventoBiblioteca() {
    const nombre = document.getElementById('evento-nombre').value.trim();
    const inicio = document.getElementById('evento-fecha-inicio').value;
    const fin = document.getElementById('evento-fecha-fin').value;
    if (!nombre || !inicio || !fin) { alert('Completa todos los campos'); return; }
    if (fin < inicio) { alert('La fecha fin debe ser posterior al inicio'); return; }

    await tursodb.query(
        `INSERT INTO biblioteca_eventos (id, nombre, fecha_inicio, fecha_fin, activo) VALUES (?, ?, ?, ?, 1)`,
        [Date.now().toString(), nombre, inicio, fin]
    );
    document.getElementById('evento-nombre').value = '';
    document.getElementById('evento-fecha-inicio').value = '';
    document.getElementById('evento-fecha-fin').value = '';
    alert('✅ Evento creado correctamente');
    await cargarListaEventos();
}

async function cargarListaEventos() {
    const listEl = document.getElementById('eventos-list');
    const result = await tursodb.query(`SELECT * FROM biblioteca_eventos ORDER BY fecha_inicio DESC`);
    if (!result.rows || result.rows.length === 0) {
        listEl.innerHTML = '<p style="color:#666;">No hay eventos creados.</p>';
        return;
    }
    listEl.innerHTML = result.rows.map(ev => {
        const estado = ev.activo == 1 ? '<span style="color:green;">● Activo</span>' : '<span style="color:#999;">● Inactivo</span>';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border:1px solid #ddd; border-radius:8px; margin-bottom:8px; background:#f9f9f9;">
                <div>
                    <strong>${ev.nombre}</strong><br>
                    <small style="color:#666;">📅 ${ev.fecha_inicio} → ${ev.fecha_fin} | ${estado}</small>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="toggleEventoActivo('${ev.id}', ${ev.activo})" class="${ev.activo == 1 ? 'btn-danger' : 'btn-success'}" style="padding:6px 12px; font-size:12px;">
                        ${ev.activo == 1 ? 'Desactivar' : 'Activar'}
                    </button>
                </div>
            </div>`;
    }).join('');
}

async function toggleEventoActivo(id, activo) {
    const nuevoEstado = activo == 1 ? 0 : 1;
    if (nuevoEstado === 1) {
        await tursodb.query(`UPDATE biblioteca_eventos SET activo = 0`);
    }
    await tursodb.query(`UPDATE biblioteca_eventos SET activo = ? WHERE id = ?`, [nuevoEstado, id]);
    await cargarListaEventos();
}

// ========== REGISTRO ==========

async function showRegistro() {
    showSection('registro-section');
    eventoActivoBib = await obtenerEventoActivo();
    const infoEl = document.getElementById('evento-activo-info');
    const sinEl = document.getElementById('sin-evento-msg');
    if (eventoActivoBib) {
        infoEl.style.display = 'block';
        sinEl.style.display = 'none';
        document.getElementById('evento-activo-nombre').textContent = `${eventoActivoBib.nombre} (${eventoActivoBib.fecha_inicio} → ${eventoActivoBib.fecha_fin})`;
    } else {
        infoEl.style.display = 'none';
        sinEl.style.display = 'block';
    }
    await cargarVisitasHoy();

    document.getElementById('ci-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') buscarYRegistrar();
    });
}

async function obtenerEventoActivo() {
    const result = await tursodb.query(`SELECT * FROM biblioteca_eventos WHERE activo = 1 LIMIT 1`);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
}

async function buscarYRegistrar() {
    if (!eventoActivoBib) {
        mostrarResultado('Sin evento activo', '⚠️ No hay evento activo. Crea uno primero.', 'warning');
        return;
    }

    const ci = document.getElementById('ci-input').value.trim();
    if (!ci) return;

    const resultEl = document.getElementById('registro-resultado');
    resultEl.innerHTML = '<p style="color:#666;">Buscando...</p>';

    // Buscar en estudiantes
    let persona = null;
    let tipo = '';
    const estResult = await tursodb.query(
        `SELECT * FROM estudiantes WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]
    );
    if (estResult.rows && estResult.rows.length > 0) {
        persona = estResult.rows[0];
        tipo = 'estudiante';
    }

    // Buscar en administrativos
    if (!persona) {
        const perResult = await tursodb.query(
            `SELECT * FROM administrativos WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]
        );
        if (perResult.rows && perResult.rows.length > 0) {
            persona = perResult.rows[0];
            tipo = 'personal';
        }
    }

    if (!persona) {
        mostrarResultado('No encontrado', `❌ No se encontró ninguna persona con CI/código: ${ci}`, 'error');
        resultEl.innerHTML = `<div style="padding:12px; background:#f8d7da; border-radius:8px; color:#721c24;">❌ No se encontró: <strong>${ci}</strong></div>`;
        return;
    }

    const nombre = `${persona.nombre} ${persona.apellido_paterno} ${persona.apellido_materno || ''}`.trim();
    const especialidad = tipo === 'estudiante' ? persona.especialidad : persona.personal;
    const anio = tipo === 'estudiante' ? persona.anio_formacion : null;
    const cargo = tipo === 'personal' ? persona.cargo : null;

    // Verificar si ya se registró en el último minuto
    const haceUnMinuto = new Date(Date.now() - 60000).toISOString();
    const reciente = await tursodb.query(
        `SELECT id FROM biblioteca_visitas WHERE evento_id = ? AND persona_ci = ? AND timestamp > ? LIMIT 1`,
        [eventoActivoBib.id, ci, haceUnMinuto]
    );
    if (reciente.rows && reciente.rows.length > 0) {
        mostrarResultado(nombre, '⏱️ Ya registrado\nEspera 1 minuto para volver a registrar', 'warning');
        resultEl.innerHTML = '';
        document.getElementById('ci-input').value = '';
        return;
    }

    await tursodb.query(
        `INSERT INTO biblioteca_visitas (id, evento_id, persona_ci, persona_nombre, persona_tipo, persona_especialidad, persona_anio, persona_cargo, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Date.now().toString(), eventoActivoBib.id, ci, nombre, tipo, especialidad, anio, cargo, new Date().toISOString()]
    );

    const infoExtra = tipo === 'estudiante'
        ? `🎓 ${especialidad} | 📅 Año ${anio}`
        : `👔 ${especialidad} | 💼 ${cargo}`;

    mostrarResultado(nombre, `✅ VISITA REGISTRADA\n${infoExtra}`, 'success');

    resultEl.innerHTML = `
        <div style="padding:15px; background:#d4edda; border-radius:8px; color:#155724;">
            <strong>✅ Visita registrada</strong><br>
            <span style="font-size:16px;">${nombre}</span><br>
            <small>${infoExtra}</small>
        </div>`;

    document.getElementById('ci-input').value = '';
    document.getElementById('ci-input').focus();
    await cargarVisitasHoy();
}

function mostrarResultado(nombre, mensaje, tipo) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;';
    const bgColor = tipo === 'success' ? '#28a745' : tipo === 'warning' ? '#ffc107' : '#dc3545';
    const textColor = tipo === 'warning' ? '#000' : '#fff';
    const icono = tipo === 'success' ? '✅' : tipo === 'warning' ? '⚠️' : '❌';
    overlay.innerHTML = `
        <div style="background:${bgColor};color:${textColor};padding:40px;border-radius:20px;text-align:center;max-width:90%;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
            <div style="font-size:4rem;margin-bottom:15px;">${icono}</div>
            <h2 style="font-size:1.8rem;margin-bottom:10px;">${nombre}</h2>
            <p style="font-size:1.2rem;white-space:pre-line;">${mensaje}</p>
        </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => { if (document.body.contains(overlay)) document.body.removeChild(overlay); }, 2500);
    overlay.addEventListener('click', () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); });
}

async function cargarVisitasHoy() {
    if (!eventoActivoBib) return;
    const hoy = new Date().toISOString().split('T')[0];
    const result = await tursodb.query(
        `SELECT * FROM biblioteca_visitas WHERE evento_id = ? AND timestamp LIKE ? ORDER BY timestamp DESC`,
        [eventoActivoBib.id, `${hoy}%`]
    );
    const listEl = document.getElementById('visitas-hoy-list');
    if (!result.rows || result.rows.length === 0) {
        listEl.innerHTML = '<p style="color:#666;">No hay visitas registradas hoy.</p>';
        return;
    }
    listEl.innerHTML = result.rows.map(v => {
        const hora = new Date(v.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });
        const icono = v.persona_tipo === 'estudiante' ? '🎓' : '👔';
        const detalle = v.persona_tipo === 'estudiante'
            ? `${v.persona_especialidad} | Año ${v.persona_anio}`
            : `${v.persona_especialidad} | ${v.persona_cargo}`;
        return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee;">
            <div>${icono} <strong>${v.persona_nombre}</strong><br><small style="color:#666;">${detalle}</small></div>
            <span style="color:#007bff; font-weight:bold;">${hora}</span>
        </div>`;
    }).join('');
}

// ========== REPORTE ==========

async function showReporte() {
    showSection('reporte-section');
    const result = await tursodb.query(`SELECT * FROM biblioteca_eventos ORDER BY fecha_inicio DESC`);
    const select = document.getElementById('select-evento-reporte');
    select.innerHTML = '<option value="">Seleccionar evento...</option>';
    (result.rows || []).forEach(ev => {
        select.innerHTML += `<option value="${ev.id}">${ev.nombre} (${ev.fecha_inicio} → ${ev.fecha_fin})</option>`;
    });
}

async function cargarReporte() {
    const eventoId = document.getElementById('select-evento-reporte').value;
    if (!eventoId) { alert('Selecciona un evento'); return; }

    const contenidoEl = document.getElementById('reporte-contenido');
    contenidoEl.innerHTML = '<p>Cargando...</p>';

    const result = await tursodb.query(
        `SELECT * FROM biblioteca_visitas WHERE evento_id = ? ORDER BY timestamp ASC`, [eventoId]
    );

    if (!result.rows || result.rows.length === 0) {
        contenidoEl.innerHTML = '<div class="card"><p>No hay visitas registradas para este evento.</p></div>';
        return;
    }

    const visitas = result.rows;
    const totalVisitas = visitas.length;
    const personasUnicas = new Set(visitas.map(v => v.persona_ci)).size;

    // Estadísticas por día
    const porDia = {};
    visitas.forEach(v => {
        const dia = v.timestamp.split('T')[0];
        if (!porDia[dia]) porDia[dia] = 0;
        porDia[dia]++;
    });

    // Agrupar por tipo y especialidad
    const estudiantes = visitas.filter(v => v.persona_tipo === 'estudiante');
    const personal = visitas.filter(v => v.persona_tipo === 'personal');

    const ordenAnios = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
    const ordenPersonal = ['DIRECTIVO', 'ADMINISTRATIVO', 'DE SERVICIO', 'DOCENTE'];

    let html = `
        <div class="card" style="margin-bottom:15px;">
            <div style="display:flex; gap:20px; flex-wrap:wrap;">
                <div style="text-align:center; flex:1; min-width:120px;">
                    <div style="font-size:2rem; font-weight:bold; color:#007bff;">${totalVisitas}</div>
                    <div style="color:#666; font-size:13px;">Total visitas</div>
                </div>
                <div style="text-align:center; flex:1; min-width:120px;">
                    <div style="font-size:2rem; font-weight:bold; color:#28a745;">${personasUnicas}</div>
                    <div style="color:#666; font-size:13px;">Personas únicas</div>
                </div>
                <div style="text-align:center; flex:1; min-width:120px;">
                    <div style="font-size:2rem; font-weight:bold; color:#fd7e14;">${Object.keys(porDia).length}</div>
                    <div style="color:#666; font-size:13px;">Días con visitas</div>
                </div>
            </div>
        </div>`;

    // Visitas por día
    html += `<div class="card" style="margin-bottom:15px;">
        <h3 style="margin-bottom:10px;">📊 Visitas por día</h3>`;
    Object.keys(porDia).sort().forEach(dia => {
        html += `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #eee;">
            <span>${dia}</span><strong>${porDia[dia]} visitas</strong></div>`;
    });
    html += `</div>`;

    // Estudiantes agrupados por especialidad > año
    if (estudiantes.length > 0) {
        const groupedEst = {};
        estudiantes.forEach(v => {
            const esp = v.persona_especialidad || 'Sin Especialidad';
            const anio = v.persona_anio || 'Sin Año';
            if (!groupedEst[esp]) groupedEst[esp] = {};
            if (!groupedEst[esp][anio]) groupedEst[esp][anio] = [];
            groupedEst[esp][anio].push(v);
        });

        Object.keys(groupedEst).sort().forEach(esp => {
            const totalEsp = Object.values(groupedEst[esp]).flat().length;
            const espId = esp.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            html += `<div class="card" style="margin-bottom:10px;">
                <div onclick="toggleBloque('bloque-${espId}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <strong>🎓 ${esp} (${totalEsp} visitas)</strong><span>▼</span>
                </div>
                <div id="bloque-${espId}" style="display:none; margin-top:10px;">`;

            Object.keys(groupedEst[esp]).sort((a, b) => {
                const ia = ordenAnios.indexOf(a), ib = ordenAnios.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                return a.localeCompare(b);
            }).forEach(anio => {
                const lista = groupedEst[esp][anio];
                html += `<div style="margin-bottom:8px;">
                    <div style="background:#f0f0f0; padding:6px 10px; border-radius:6px; font-weight:bold; margin-bottom:4px;">
                        📅 Año ${anio} (${lista.length} visitas)
                    </div>`;
                lista.forEach(v => {
                    const hora = new Date(v.timestamp).toLocaleString('es-BO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
                    html += `<div style="padding:5px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                        <span>${v.persona_nombre}</span><small style="color:#666;">${hora}</small></div>`;
                });
                html += `</div>`;
            });
            html += `</div></div>`;
        });
    }

    // Personal agrupado por tipo
    if (personal.length > 0) {
        const groupedPer = {};
        personal.forEach(v => {
            const tipo = v.persona_especialidad || 'Sin Tipo';
            if (!groupedPer[tipo]) groupedPer[tipo] = [];
            groupedPer[tipo].push(v);
        });

        Object.keys(groupedPer).sort((a, b) => {
            const ia = ordenPersonal.indexOf(a), ib = ordenPersonal.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            return a.localeCompare(b);
        }).forEach(tipo => {
            const lista = groupedPer[tipo];
            const tipoId = tipo.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            html += `<div class="card" style="margin-bottom:10px;">
                <div onclick="toggleBloque('bloque-per-${tipoId}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <strong>👔 ${tipo} (${lista.length} visitas)</strong><span>▼</span>
                </div>
                <div id="bloque-per-${tipoId}" style="display:none; margin-top:10px;">`;
            lista.forEach(v => {
                const hora = new Date(v.timestamp).toLocaleString('es-BO', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false});
                html += `<div style="padding:5px 10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                    <span>${v.persona_nombre}</span><small style="color:#666;">${hora}</small></div>`;
            });
            html += `</div></div>`;
        });
    }

    contenidoEl.innerHTML = html;
}

function toggleBloque(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ========== EXPORTAR EXCEL ==========

async function exportarReporteExcel() {
    const eventoId = document.getElementById('select-evento-reporte').value;
    if (!eventoId) { alert('Selecciona un evento primero'); return; }

    const evResult = await tursodb.query(`SELECT * FROM biblioteca_eventos WHERE id = ?`, [eventoId]);
    const evento = evResult.rows[0];
    const result = await tursodb.query(`SELECT * FROM biblioteca_visitas WHERE evento_id = ? ORDER BY timestamp ASC`, [eventoId]);

    if (!result.rows || result.rows.length === 0) { alert('No hay visitas para exportar'); return; }

    const wb = XLSX.utils.book_new();
    const ordenAnios = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];

    // Hoja estudiantes
    const estudiantes = result.rows.filter(v => v.persona_tipo === 'estudiante');
    if (estudiantes.length > 0) {
        const wsData = [
            [`REPORTE BIBLIOTECA - ${evento.nombre.toUpperCase()}`],
            [`ESTUDIANTES | Total visitas: ${estudiantes.length}`],
            [],
            ['CI', 'Nombre', 'Especialidad', 'Año', 'Fecha/Hora']
        ];
        estudiantes.sort((a, b) => {
            if (a.persona_especialidad !== b.persona_especialidad) return (a.persona_especialidad || '').localeCompare(b.persona_especialidad || '');
            const ia = ordenAnios.indexOf(a.persona_anio), ib = ordenAnios.indexOf(b.persona_anio);
            if (ia !== -1 && ib !== -1) return ia - ib;
            return 0;
        }).forEach(v => {
            wsData.push([v.persona_ci, v.persona_nombre, v.persona_especialidad, v.persona_anio,
                new Date(v.timestamp).toLocaleString('es-BO', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false})]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{wch:12},{wch:28},{wch:20},{wch:10},{wch:18}];
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}];
        XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
    }

    // Hoja personal
    const personal = result.rows.filter(v => v.persona_tipo === 'personal');
    if (personal.length > 0) {
        const wsData = [
            [`REPORTE BIBLIOTECA - ${evento.nombre.toUpperCase()}`],
            [`PERSONAL | Total visitas: ${personal.length}`],
            [],
            ['CI', 'Nombre', 'Tipo Personal', 'Cargo', 'Fecha/Hora']
        ];
        personal.forEach(v => {
            wsData.push([v.persona_ci, v.persona_nombre, v.persona_especialidad, v.persona_cargo,
                new Date(v.timestamp).toLocaleString('es-BO', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false})]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{wch:12},{wch:28},{wch:18},{wch:30},{wch:18}];
        ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}}];
        XLSX.utils.book_append_sheet(wb, ws, 'Personal');
    }

    XLSX.writeFile(wb, `Biblioteca_${evento.nombre.replace(/[^a-zA-Z0-9]/g,'_')}.xlsx`);
}

// ========== ESCÁNER QR BIBLIOTECA ==========

let html5QrCodeBib = null;
let isScanningBib = false;
let isFlashOnBib = false;

function startCameraBib() {
    const container = document.getElementById('scanner-container-bib');
    const btnCamera = document.getElementById('btn-camera-bib');
    const btnFlash = document.getElementById('btn-flash-bib');

    if (btnFlash) {
        btnFlash.className = 'btn-secondary';
        btnFlash.textContent = '⚡ Flash';
    }
    isFlashOnBib = false;

    // Si ya está activa, detener
    if (html5QrCodeBib) {
        if (html5QrCodeBib.isScanning) html5QrCodeBib.stop().catch(() => {});
        html5QrCodeBib = null;
        container.style.display = 'none';
        container.innerHTML = '';
        btnCamera.className = 'btn-secondary';
        btnCamera.textContent = '📷 Cámara';
        return;
    }

    container.innerHTML = '<div id="camera-reader-bib" style="width:100%; max-width:500px; margin:0 auto; min-height:300px; background:#000; border-radius:8px;"></div>';
    container.style.display = 'block';
    btnCamera.className = 'btn-primary';
    btnCamera.textContent = '📷 Cámara Activa';

    setTimeout(() => {
        html5QrCodeBib = new Html5Qrcode('camera-reader-bib');
        html5QrCodeBib.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onQrScanBib,
            () => {}
        ).catch(() => {
            container.innerHTML = `<div style="padding:20px; color:#dc3545; background:#f8d7da; border-radius:8px; text-align:center;">❌ No se pudo acceder a la cámara.<br><small>Verifica los permisos del navegador</small></div>`;
            btnCamera.className = 'btn-secondary';
            btnCamera.textContent = '📷 Cámara';
            html5QrCodeBib = null;
        });
    }, 300);
}

function showFileUploadBib() {
    const container = document.getElementById('scanner-container-bib');
    const photoTools = document.getElementById('photo-tools-bib');
    const btnCamera = document.getElementById('btn-camera-bib');
    const btnFile = document.getElementById('btn-file-bib');
    const btnFlash = document.getElementById('btn-flash-bib');

    if (btnFlash) {
        btnFlash.className = 'btn-secondary';
        btnFlash.textContent = '⚡ Flash';
    }
    isFlashOnBib = false;

    if (html5QrCodeBib) {
        if (html5QrCodeBib.isScanning) html5QrCodeBib.stop().catch(() => {});
        html5QrCodeBib = null;
    }

    container.innerHTML = '';
    container.style.display = 'none';
    if (photoTools) photoTools.style.display = 'block';
    const fileInput = document.getElementById('qr-file-input-bib');
    if (fileInput) fileInput.value = '';
    btnCamera.className = 'btn-secondary';
    btnCamera.textContent = '📷 Cámara';
    btnFile.className = 'btn-primary';
    btnFile.textContent = '📁 Cargar Foto Activo';
}

async function toggleFlashBib() {
    if (!html5QrCodeBib || !html5QrCodeBib.isScanning) {
        alert('Primero debes activar la cámara presionando "📷 Cámara".');
        return;
    }

    const btnFlash = document.getElementById('btn-flash-bib');
    const targetState = !isFlashOnBib;

    try {
        if (typeof html5QrCodeBib.applyVideoConstraints === 'function') {
            await html5QrCodeBib.applyVideoConstraints({
                advanced: [{ torch: targetState }]
            });
            isFlashOnBib = targetState;
        } else {
            const videoElement = document.querySelector('#camera-reader-bib video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                if (track) {
                    await track.applyConstraints({
                        advanced: [{ torch: targetState }]
                    });
                    isFlashOnBib = targetState;
                } else {
                    throw new Error('No se encontró la pista de video');
                }
            } else {
                throw new Error('No se encontró el elemento de video');
            }
        }

        if (btnFlash) {
            btnFlash.textContent = isFlashOnBib ? '⚡ Flash ON' : '⚡ Flash';
            btnFlash.className = isFlashOnBib ? 'btn-warning' : 'btn-secondary';
        }
    } catch (err) {
        console.error('❌ Error al alternar linterna/flash:', err);
        alert('⚡ No se pudo activar el flash. Es posible que esta cámara o dispositivo no lo soporte.');
    }
}

function processImageBib() {
    const fileInput = document.getElementById('qr-file-input-bib');
    const file = fileInput.files[0];
    if (!file) { alert('Selecciona una imagen primero'); return; }

    const tempId = 'temp-bib-' + Date.now();
    const tempDiv = document.createElement('div');
    tempDiv.id = tempId;
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    const scanner = new Html5Qrcode(tempId);
    scanner.scanFile(file, true)
        .then(decoded => {
            document.body.removeChild(tempDiv);
            onQrScanBib(decoded);
        })
        .catch(() => {
            document.body.removeChild(tempDiv);
            alert('❌ No se pudo leer el código QR de la imagen.');
        });
    fileInput.value = '';
}

async function onQrScanBib(qrData) {
    if (isScanningBib) return;
    isScanningBib = true;

    // Pausar cámara durante el procesamiento para evitar callbacks acumulados
    if (html5QrCodeBib && html5QrCodeBib.isScanning) {
        await html5QrCodeBib.pause();
    }

    const partes = qrData.split('|');
    const codigoUnico = partes[partes.length - 1].trim();
    document.getElementById('ci-input').value = codigoUnico;
    await buscarYRegistrar();

    // Reanudar cámara después de 2 segundos
        setTimeout(async () => {
        if (html5QrCodeBib && html5QrCodeBib.isScanning === false) {
            try { await html5QrCodeBib.resume(); } catch(e) {}
        }
        isScanningBib = false;
    }, 2000);
}

// ========== SISTEMA DE PRÉSTAMOS Y CATÁLOGO DE LIBROS ==========

let cartUser = null;
let cartItems = [];
let catalogoLibrosCache = [];
let prestamosCache = [];
let reservasCache = [];

// Helper para parsear fechas de forma segura evitando desfases de zona horaria en cadenas YYYY-MM-DD
function parseFecha(fechaStr) {
    if (!fechaStr) return new Date();
    if (typeof fechaStr === 'object' && fechaStr instanceof Date) return fechaStr;
    if (fechaStr.includes('T')) {
        const d = new Date(fechaStr);
        if (!isNaN(d.getTime())) return d;
    }
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length === 3) {
        return new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 12, 0, 0);
    }
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? new Date() : d;
}

// Helper: Calcular fecha límite de devolución sumando N horas hábiles (Lunes a Viernes)
function calcularFechaDevolucion(fechaInicio = new Date(), duracionInput = 48) {
    let fecha = new Date(parseFecha(fechaInicio).getTime());
    let horasHabiles = parseInt(duracionInput) || 48;

    // Si se pasa un valor en días (ej. 1, 2, 3, 5, 10), convertir a horas
    if (horasHabiles <= 10) {
        if (horasHabiles === 3) horasHabiles = 70;
        else horasHabiles = horasHabiles * 24;
    }

    // Si el inicio cae en fin de semana, mover al Lunes a las 08:00
    if (fecha.getDay() === 6) {       // Sábado → Lunes
        fecha.setDate(fecha.getDate() + 2);
        fecha.setHours(8, 0, 0, 0);
    } else if (fecha.getDay() === 0) { // Domingo → Lunes
        fecha.setDate(fecha.getDate() + 1);
        fecha.setHours(8, 0, 0, 0);
    }

    let horasContadas = 0;
    while (horasContadas < horasHabiles) {
        fecha.setTime(fecha.getTime() + 60 * 60 * 1000);
        const dia = fecha.getDay();
        if (dia >= 1 && dia <= 5) {
            horasContadas++;
        } else if (dia === 6) {
            fecha.setTime(fecha.getTime() + 48 * 60 * 60 * 1000);
        }
    }
    return fecha.toISOString();
}

// Formatear fechas solo dia/mes/año
function formatearFecha(fechaStr) {
    if (!fechaStr) return '--';
    try {
        const d = parseFecha(fechaStr);
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const anio = d.getFullYear();
        return `${dia}/${mes}/${anio}`;
    } catch (e) {
        return fechaStr;
    }
}

// Formatear fecha y hora para UI (DD/MM/YYYY HH:mm)
function formatearFechaHora(fechaStr) {
    if (!fechaStr) return '--';
    try {
        if (!fechaStr.includes('T')) {
            return formatearFecha(fechaStr);
        }
        const d = new Date(fechaStr);
        if (isNaN(d.getTime())) return formatearFecha(fechaStr);
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const anio = d.getFullYear();
        const hrs = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${anio} ${hrs}:${mins}`;
    } catch (e) {
        return fechaStr;
    }
}

// Navegación de Pestañas en Préstamos y Libros
function showPrestamosSection() {
    showSection('prestamos-section');
    switchBibTab('carrito');
}

function switchBibTab(tabName) {
    document.querySelectorAll('.bib-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.bib-tab-btn').forEach(btn => btn.classList.remove('active'));

    const contentEl = document.getElementById(`tab-${tabName}`);
    const btnEl = document.getElementById(`btn-tab-${tabName}`);
    if (contentEl) contentEl.classList.remove('hidden');
    if (btnEl) btnEl.classList.add('active');

    if (tabName === 'catalogo') cargarCatalogoLibros();
    if (tabName === 'proyectos') cargarCatalogoProyectos();
    if (tabName === 'monitoreo') cargarMonitoreoPrestamos();
    if (tabName === 'reservas') cargarReservas();
    if (tabName === 'carrito') actualizarVistaCarrito();
}

// ---------- 1. LÓGICA DEL CARRITO DE PRÉSTAMOS ----------

async function buscarUsuarioCarrito() {
    const ci = document.getElementById('cart-user-input').value.trim();
    const infoEl = document.getElementById('cart-user-info');
    if (!ci) { alert('Ingresa un CI o código único'); return; }

    infoEl.innerHTML = '<p style="color:#666;">Buscando usuario...</p>';
    cartUser = null;

    // 1. Buscar estudiante
    const estRes = await tursodb.query(`SELECT * FROM estudiantes WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
    if (estRes.rows && estRes.rows.length > 0) {
        const est = estRes.rows[0];
        cartUser = {
            ci: est.dni || est.codigo_unico,
            nombre: `${est.nombre} ${est.apellido_paterno} ${est.apellido_materno || ''}`.trim(),
            tipo: 'estudiante',
            detalle: `🎓 ${est.especialidad} | Año ${est.anio_formacion}`
        };
    }

    // 2. Buscar personal administrativo
    if (!cartUser) {
        const admRes = await tursodb.query(`SELECT * FROM administrativos WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
        if (admRes.rows && admRes.rows.length > 0) {
            const adm = admRes.rows[0];
            cartUser = {
                ci: adm.dni || adm.codigo_unico,
                nombre: `${adm.nombre} ${adm.apellido_paterno} ${adm.apellido_materno || ''}`.trim(),
                tipo: 'personal',
                detalle: `👔 ${adm.personal} | ${adm.cargo}`
            };
        }
    }

    // 3. Buscar en tabla usuarios general
    if (!cartUser) {
        const usrRes = await tursodb.query(`SELECT * FROM usuarios WHERE ci = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
        if (usrRes.rows && usrRes.rows.length > 0) {
            const u = usrRes.rows[0];
            cartUser = {
                ci: u.ci || u.codigo_unico,
                nombre: `${u.nombre} ${u.apellido_paterno || ''} ${u.apellido_materno || ''}`.trim(),
                tipo: 'usuario',
                detalle: `👤 ${u.rol.toUpperCase()}`
            };
        }
    }

    if (!cartUser) {
        infoEl.innerHTML = `<span style="color:#dc3545;">❌ No se encontró persona con CI/Código: <strong>${ci}</strong></span>`;
        return;
    }

    // Consultar préstamos activos previos del usuario
    const prevLoans = await tursodb.query(
        `SELECT COUNT(*) as cant FROM biblioteca_prestamos WHERE persona_ci = ? AND estado = 'activo'`,
        [cartUser.ci]
    );
    const cantActivos = prevLoans.rows && prevLoans.rows[0] ? prevLoans.rows[0].cant : 0;

    infoEl.innerHTML = `
        <div style="background:#e3f2fd; padding:10px; border-radius:6px; border:1px solid #90caf9;">
            <strong style="font-size:15px; color:#1565c0;">${cartUser.nombre}</strong><br>
            <span style="font-size:12px; color:#555;">CI: ${cartUser.ci} | ${cartUser.detalle}</span><br>
            <span class="badge ${cantActivos > 0 ? 'badge-warning' : 'badge-success'}" style="margin-top:5px;">
                ${cantActivos > 0 ? `⚠️ tiene ${cantActivos} préstamo(s) activo(s)` : '✅ Sin préstamos pendientes'}
            </span>
        </div>
    `;
}

// Helper: Formatear a 2 dígitos numéricos fija (01, 02, 12, etc.)
function pad2(val) {
    if (!val && val !== 0) return '01';
    const str = String(val).trim();
    if (!isNaN(str) && str.length < 2) {
        return str.padStart(2, '0');
    }
    return str;
}

// Helper: Previsualizar códigos de ejemplares en el formulario
function actualizarPrevisualizacionCodigos() {
    const rawArea = document.getElementById('book-input-cod')?.value.trim() || '';
    const rawNum = document.getElementById('book-input-num')?.value.trim() || '';
    const areaCod = pad2(rawArea);
    const libroNum = pad2(rawNum);
    const cant = parseInt(document.getElementById('book-input-ejemplares')?.value) || 1;
    const prevEl = document.getElementById('book-code-preview');
    if (!prevEl) return;

    if (!rawArea || !rawNum) {
        prevEl.textContent = 'Ingresa COD (Área), Nº y Nº EJEM. para previsualizar';
        return;
    }

    const codigos = [];
    for (let i = 1; i <= cant; i++) {
        codigos.push(`${areaCod}${libroNum}${pad2(i)}`);
    }

    if (codigos.length <= 5) {
        prevEl.textContent = codigos.join(', ');
    } else {
        prevEl.textContent = `${codigos.slice(0, 4).join(', ')} ... ${codigos[codigos.length - 1]} (${cant} ejemplares)`;
    }
}

async function buscarLibroParaCarrito() {
    const rawQ = document.getElementById('cart-book-input').value.trim();
    const resultsEl = document.getElementById('cart-book-results');
    if (!rawQ) { resultsEl.innerHTML = ''; return; }

    resultsEl.innerHTML = '<p style="color:#666; font-size:13px;">Buscando ejemplares de libros y proyectos...</p>';

    const cleanQ = rawQ.replace(/['"]/g, '');

    const searchVariants = [cleanQ];
    if (/^\d+$/.test(cleanQ)) {
        // Si el código termina en "00" (ej: 010300 o 01201400), agregar el prefijo de familia (0103 o 012014)
        if (cleanQ.endsWith('00') && cleanQ.length >= 4) {
            const familyPrefix = cleanQ.slice(0, -2);
            if (!searchVariants.includes(familyPrefix)) searchVariants.push(familyPrefix);
        }
        if (cleanQ.length === 6 || cleanQ.length === 8) {
            searchVariants.push(cleanQ);
        }
        if (cleanQ.length <= 4) {
            const parts = [];
            for (let i = 0; i < cleanQ.length; i += 2) {
                parts.push(pad2(cleanQ.slice(i, i + 2)));
            }
            const normalized = parts.join('');
            if (!searchVariants.includes(normalized)) searchVariants.push(normalized);
        }
        const padded = cleanQ.padStart(2, '0');
        if (!searchVariants.includes(padded)) searchVariants.push(padded);
    }

    const likeConditions = searchVariants.map(() => `e.codigo_ejemplar LIKE ?`).join(' OR ');
    const likeParams = searchVariants.map(v => `${v}%`);

    // 1. Búsqueda en Libros
    let ejemRes = await tursodb.query(
        `SELECT e.id as ejem_id, e.codigo_ejemplar, e.ejemplar_num, e.estado as ejem_estado,
                l.id as libro_id, l.titulo, l.autor, l.editorial, l.area_cod, l.libro_num, 'libro' as tipo_item 
         FROM biblioteca_ejemplares e 
         JOIN biblioteca_libros l ON e.libro_id = l.id 
         WHERE ${likeConditions}
            OR e.codigo_ejemplar LIKE ?
            OR l.titulo LIKE ?
            OR l.autor LIKE ?
            OR l.editorial LIKE ?
         ORDER BY e.codigo_ejemplar ASC
         LIMIT 50`,
        [...likeParams, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`]
    );

    let rowsLibros = ejemRes.rows || [];

    // 2. Búsqueda en Proyectos
    const proyLikeConditions = searchVariants.map(() => `pe.codigo_ejemplar LIKE ?`).join(' OR ');
    const proyRes = await tursodb.query(
        `SELECT pe.id as ejem_id, pe.codigo_ejemplar, pe.ejemplar_num, pe.estado as ejem_estado,
                p.id as libro_id, p.titulo, p.autores as autor, 'PROYECTO DE GRADO' as editorial, p.cod_esp as area_cod, p.proyecto_num as libro_num, 'proyecto' as tipo_item 
         FROM biblioteca_proyectos_ejemplares pe 
         JOIN biblioteca_proyectos p ON pe.proyecto_id = p.id 
         WHERE ${proyLikeConditions}
            OR pe.codigo_ejemplar LIKE ?
            OR p.titulo LIKE ?
            OR p.autores LIKE ?
            OR p.especialidad LIKE ?
         ORDER BY pe.codigo_ejemplar ASC
         LIMIT 50`,
        [...likeParams, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`]
    );

    let rowsProyectos = proyRes.rows || [];
    let rows = [...rowsLibros, ...rowsProyectos];

    cartSearchResultsMap = {};

    if (rows.length === 0) {
        resultsEl.innerHTML = '<p style="color:#888; font-size:13px; font-style:italic;">No se encontraron libros ni proyectos. Intenta por código (ej: <b>010301</b> o <b>010300</b> para toda la familia) o palabras del título.</p>';
        return;
    }

    resultsEl.innerHTML = rows.map(item => {
        cartSearchResultsMap[item.ejem_id] = item;

        const enCarrito = cartItems.some(c => c.ejemId === item.ejem_id);
        const estaDisponible = item.ejem_estado === 'disponible';
        const disabled = !estaDisponible || enCarrito;

        const estadoUpper = (item.ejem_estado || 'DISPONIBLE').toUpperCase();
        let statusBadge = '';
        if (item.ejem_estado === 'disponible') {
            statusBadge = `<span class="badge badge-success" style="font-size:10px; margin-left:4px;">✓ DISPONIBLE</span>`;
        } else if (item.ejem_estado === 'prestado') {
            statusBadge = `<span class="badge badge-danger" style="font-size:10px; margin-left:4px;">❌ PRESTADO</span>`;
        } else if (item.ejem_estado === 'reservado') {
            statusBadge = `<span class="badge badge-warning" style="font-size:10px; margin-left:4px;">⏱️ RESERVADO</span>`;
        } else {
            statusBadge = `<span class="badge badge-secondary" style="font-size:10px; margin-left:4px;">${estadoUpper}</span>`;
        }

        const btnText = enCarrito ? '✓ En Carrito' : (!estaDisponible ? `[${estadoUpper}]` : '+ Agregar');
        const badgeTipo = item.tipo_item === 'proyecto' 
            ? `<span class="badge badge-info" style="font-size:10px; margin-left:4px;">📂 PROYECTO</span>` 
            : `<span class="badge badge-secondary" style="font-size:10px; margin-left:4px;">📖 LIBRO</span>`;

        const bgColor = enCarrito ? '#f0f4f8' : (estaDisponible ? '#ffffff' : '#fff5f5');

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:9px 12px; border-bottom:1px solid #eee; background:${bgColor};">
                <div style="font-size:13px; flex:1; padding-right:10px;">
                    <strong style="color:#007bff; font-family:monospace; font-size:14px;">[${item.codigo_ejemplar}]</strong> 
                    <strong>${safeEscape(item.titulo)}</strong> 
                    ${badgeTipo} 
                    ${statusBadge} 
                    <small style="color:#444; font-weight:bold; margin-left:4px;">(Ejemplar #${item.ejemplar_num})</small><br>
                    <small style="color:#666;">${item.tipo_item === 'proyecto' ? 'Cod_Esp' : 'Área'}: ${item.area_cod || '-'} | Nº: ${item.libro_num || '-'} | Autor(es): ${safeEscape(item.autor || 'N/A')}</small>
                </div>
                <button onclick="agregarAlCarritoId('${item.ejem_id}')" 
                        class="${enCarrito ? 'btn-secondary' : (estaDisponible ? 'btn-success' : 'btn-danger')}" 
                        style="padding:6px 12px; font-size:12px; font-weight:bold;" ${disabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
}

let cartSearchResultsMap = {};

function safeEscape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeHtml(str) {
    return safeEscape(str);
}

function agregarAlCarritoId(ejemId) {
    const item = cartSearchResultsMap[ejemId];
    if (!item) return;
    if (cartItems.some(i => i.ejemId === item.ejem_id)) return;

    cartItems.push({
        ejemId: item.ejem_id,
        libroId: item.libro_id,
        codigo: item.codigo_ejemplar,
        titulo: `${item.titulo} (#${item.ejemplar_num})`,
        tipoItem: item.tipo_item || 'libro'
    });

    actualizarVistaCarrito();
    buscarLibroParaCarrito();
}

function agregarAlCarrito(ejemId, libroId, codigo, titulo, tipoItem = 'libro') {
    if (cartItems.some(i => i.ejemId === ejemId)) return;
    cartItems.push({ ejemId, libroId, codigo, titulo, tipoItem });
    actualizarVistaCarrito();
    buscarLibroParaCarrito();
}

function removerDelCarrito(ejemId) {
    cartItems = cartItems.filter(i => i.ejemId !== ejemId);
    actualizarVistaCarrito();
    buscarLibroParaCarrito();
}

function actualizarVistaCarrito() {
    const listEl = document.getElementById('cart-items-list');
    const countEl = document.getElementById('cart-count');
    const deadlineEl = document.getElementById('cart-deadline-info');
    const daysSelectEl = document.getElementById('cart-days-select');

    if (countEl) countEl.textContent = cartItems.length;

    const horas = daysSelectEl ? (parseInt(daysSelectEl.value) || 48) : 48;
    const fechaPrevista = calcularFechaDevolucion(new Date(), horas);
    if (deadlineEl) {
        deadlineEl.textContent = `📅 Fecha límite de devolución (${horas}h hábiles): ${formatearFechaHora(fechaPrevista)}`;
    }

    if (!listEl) return;

    if (cartItems.length === 0) {
        listEl.innerHTML = '<p style="color:#888; font-style:italic; text-align:center; padding-top:40px;">El carrito está vacío</p>';
        return;
    }

    listEl.innerHTML = cartItems.map((item, index) => `
        <div class="cart-item">
            <div>
                <div class="cart-item-title">${index + 1}. [${item.codigo}] ${item.titulo}</div>
            </div>
            <button onclick="removerDelCarrito('${item.ejemId}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">🗑️ Quitar</button>
        </div>
    `).join('');
}

async function confirmarPrestamoCarrito() {
    if (!cartUser) {
        alert('⚠️ Selecciona un usuario solicitante antes de confirmar el préstamo.');
        return;
    }
    if (cartItems.length === 0) {
        alert('⚠️ Agrega al menos un ejemplar al carrito.');
        return;
    }

    const daysSelectEl = document.getElementById('cart-days-select');
    const horas = daysSelectEl ? (parseInt(daysSelectEl.value) || 48) : 48;

    // Capturar datos del usuario ANTES de operaciones async para evitar race conditions
    const userName = cartUser.nombre;
    const userCi = cartUser.ci;
    const userTipo = cartUser.tipo;

    const fechaHoy = new Date().toISOString();
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), horas);
    const prestamoId = Date.now().toString();

    // 1. Insertar Cabecera de Préstamo
    await tursodb.query(
        `INSERT INTO biblioteca_prestamos (id, persona_ci, persona_nombre, persona_tipo, fecha_prestamo, fecha_devolucion_prevista, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [prestamoId, userCi, userName, userTipo, fechaHoy, fechaDevolucionPrevista]
    );

    // 2. Insertar Detalle de Libros / Proyectos y Marcar Ejemplar como 'prestado'
    for (const item of cartItems) {
        const detalleId = `${prestamoId}-${item.ejemId}`;
        const tipoItem = item.tipoItem || 'libro';

        await tursodb.query(
            `INSERT INTO biblioteca_prestamo_detalles (id, prestamo_id, libro_id, ejemplar_id, libro_codigo, libro_titulo, estado_item, tipo_item)
             VALUES (?, ?, ?, ?, ?, ?, 'prestado', ?)`,
            [detalleId, prestamoId, item.libroId, item.ejemId, item.codigo, item.titulo, tipoItem]
        );

        if (tipoItem === 'proyecto') {
            await tursodb.query(`UPDATE biblioteca_proyectos_ejemplares SET estado = 'prestado' WHERE id = ?`, [item.ejemId]);
            const proyRes = await tursodb.query(`SELECT cantidad_disponible FROM biblioteca_proyectos WHERE id = ?`, [item.libroId]);
            if (proyRes.rows && proyRes.rows.length > 0) {
                const currentDisp = proyRes.rows[0].cantidad_disponible || 0;
                await tursodb.query(`UPDATE biblioteca_proyectos SET cantidad_disponible = ? WHERE id = ?`, [Math.max(0, currentDisp - 1), item.libroId]);
            }
        } else {
            await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'prestado' WHERE id = ?`, [item.ejemId]);
            const libRes = await tursodb.query(`SELECT cantidad_disponible FROM biblioteca_libros WHERE id = ?`, [item.libroId]);
            if (libRes.rows && libRes.rows.length > 0) {
                const currentDisp = libRes.rows[0].cantidad_disponible || 0;
                await tursodb.query(`UPDATE biblioteca_libros SET cantidad_disponible = ? WHERE id = ?`, [Math.max(0, currentDisp - 1), item.libroId]);
            }
        }
    }

    alert(`✅ PRÉSTAMO REGISTRADO CON ÉXITO\nSe prestaron ${cartItems.length} ejemplar(es) a ${userName}.\nFecha límite de devolución: ${formatearFechaHora(fechaDevolucionPrevista)}`);

    // Resetear formulario y redirigir a monitoreo
    cartUser = null;
    cartItems = [];
    document.getElementById('cart-user-input').value = '';
    document.getElementById('cart-book-input').value = '';
    document.getElementById('cart-user-info').innerHTML = '<em>No hay usuario seleccionado. Busca un CI arriba.</em>';
    document.getElementById('cart-book-results').innerHTML = '';
    actualizarVistaCarrito();

    switchBibTab('monitoreo');
}

// ---------- 2. MONITOREO DE PRÉSTAMOS EN TIEMPO REAL ----------

async function cargarMonitoreoPrestamos() {
    const tbody = document.getElementById('monitoreo-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#666;">Cargando préstamos...</td></tr>';

    const res = await tursodb.query(`SELECT * FROM biblioteca_prestamos ORDER BY created_at DESC`);
    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No hay registros de préstamos.</td></tr>';
        return;
    }

    prestamosCache = res.rows;
    await renderTablaMonitoreo(prestamosCache);
}

async function renderTablaMonitoreo(lista) {
    const tbody = document.getElementById('monitoreo-table-body');
    const ahoraIso = new Date().toISOString();

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">No hay préstamos con los filtros seleccionados.</td></tr>';
        return;
    }

    let rowsHtml = '';

    for (const p of lista) {
        const detRes = await tursodb.query(
            `SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`,
            [p.id]
        );
        const detalles = detRes.rows || [];
        const totalItems = detalles.length;
        const devueltosCount = detalles.filter(d => d.estado_item === 'devuelto').length;

        const librosText = detalles.map(d => {
            const isDevuelto = d.estado_item === 'devuelto';
            const titleOnly = `${d.libro_titulo}${isDevuelto ? ' (DEVUELTO)' : ''}`;
            return `<span class="book-code-chip ${isDevuelto ? 'devuelto' : ''}" data-tooltip="${escapeHtml(titleOnly)}" title="${escapeHtml(titleOnly)}">${d.libro_codigo}${isDevuelto ? ' ✓' : ''}</span>`;
        }).join(' ');

        let estadoBadge = '';
        if (p.estado === 'devuelto' || (totalItems > 0 && devueltosCount === totalItems)) {
            estadoBadge = '<span class="badge badge-success">Devuelto</span>';
        } else if (p.fecha_devolucion_prevista < ahoraIso) {
            estadoBadge = '<span class="badge badge-danger">⚠️ Vencido</span>';
            if (devueltosCount > 0) {
                estadoBadge += `<br><small style="color:#d9534f; font-weight:600;">(${devueltosCount}/${totalItems} devueltos)</small>`;
            }
        } else {
            estadoBadge = '<span class="badge badge-warning">En Préstamo</span>';
            if (devueltosCount > 0) {
                estadoBadge += `<br><small style="color:#2b8a3e; font-weight:600;">(${devueltosCount}/${totalItems} devueltos)</small>`;
            }
        }

        const esActivo = p.estado === 'activo' && devueltosCount < totalItems;

        rowsHtml += `
            <tr>
                <td>
                    <strong>${p.persona_nombre}</strong><br>
                    <small style="color:#666;">CI: ${p.persona_ci} (${p.persona_tipo})</small>
                </td>
                <td>${librosText || 'Sin detalles'}</td>
                <td>${formatearFechaHora(p.fecha_prestamo)}</td>
                <td><strong>${formatearFechaHora(p.fecha_devolucion_prevista)}</strong></td>
                <td>${estadoBadge}</td>
                <td>
                    ${esActivo ? `
                        <button onclick="abrirModalDevolver('${p.id}')" class="btn-success" style="padding:4px 8px; font-size:12px; margin-bottom:3px;">↩️ Devolver</button>
                        <button onclick="abrirModalRenovar('${p.id}')" class="btn-info" style="padding:4px 8px; font-size:12px;">🔄 Renovar (70h)</button>
                    ` : '<small style="color:#888;">Finalizado</small>'}
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = rowsHtml;
}

function filtrarMonitoreo() {
    const q = document.getElementById('mon-search-input').value.toLowerCase().trim();
    const st = document.getElementById('mon-filter-status').value;
    const ahoraIso = new Date().toISOString();

    const filtrados = prestamosCache.filter(p => {
        const matchQ = p.persona_nombre.toLowerCase().includes(q) || p.persona_ci.toLowerCase().includes(q);
        let matchSt = true;
        if (st === 'activo') matchSt = p.estado === 'activo' && p.fecha_devolucion_prevista >= ahoraIso;
        if (st === 'vencido') matchSt = p.estado === 'activo' && p.fecha_devolucion_prevista < ahoraIso;
        if (st === 'devuelto') matchSt = p.estado === 'devuelto';
        return matchQ && matchSt;
    });

    renderTablaMonitoreo(filtrados);
}

// ---------- DEVOLUCIÓN DE EJEMPLARES INDIVIDUALES ----------

async function abrirModalDevolver(prestamoId) {
    try {
        const pRes = await tursodb.query(`SELECT * FROM biblioteca_prestamos WHERE id = ?`, [String(prestamoId)]);
        if (!pRes.rows || pRes.rows.length === 0) return alert('⚠️ Préstamo no encontrado.');
        const prestamo = pRes.rows[0];

        const detRes = await tursodb.query(`SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`, [String(prestamoId)]);
        const detalles = detRes.rows || [];

        let itemsHtml = '';
        let activeCount = 0;

        detalles.forEach((d) => {
            const isDevuelto = d.estado_item === 'devuelto';
            if (!isDevuelto) activeCount++;

            itemsHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; background:${isDevuelto ? '#f8fafc' : '#ffffff'};">
                    <div style="display:flex; align-items:center; gap:12px; flex:1;">
                        <input type="checkbox" class="chk-devolver-item" value="${d.id}" ${isDevuelto ? 'disabled' : 'checked'} style="width:18px; height:18px; cursor:pointer;">
                        <div>
                            <span class="book-code-chip ${isDevuelto ? 'devuelto' : ''}">${escapeHtml(d.libro_codigo)}</span>
                            <strong style="font-size:14px; color:#1e293b;">${escapeHtml(d.libro_titulo)}</strong>
                        </div>
                    </div>
                    <div>
                        ${isDevuelto 
                            ? `<span class="badge badge-success">✓ Devuelto (${formatearFechaHora(d.fecha_devolucion_item)})</span>` 
                            : `<span class="badge badge-warning">En Préstamo</span>`}
                    </div>
                </div>
            `;
        });

        const modalHtml = `
            <div id="modal-devolucion-overlay" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>↩️ Devolución de Ejemplares</h3>
                        <button class="modal-close-btn" onclick="cerrarModalDevolucion()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:#f1f5f9; padding:12px 15px; border-radius:8px; margin-bottom:15px; font-size:13px; color:#334155;">
                            <strong>👤 Usuario:</strong> ${escapeHtml(prestamo.persona_nombre)} (CI: ${escapeHtml(prestamo.persona_ci)})<br>
                            <strong>📅 Préstamo realizado:</strong> ${formatearFechaHora(prestamo.fecha_prestamo)} | <strong>Límite actual:</strong> ${formatearFechaHora(prestamo.fecha_devolucion_prevista)}
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <label style="font-weight:bold; font-size:13px; color:#475569;">Selecciona los libros que se están devolviendo:</label>
                            ${activeCount > 1 ? `
                                <div style="display:flex; gap:6px;">
                                    <button type="button" class="btn-secondary" style="padding:3px 8px; font-size:11px;" onclick="toggleTodosDevolver(true)">Marcar Todos</button>
                                    <button type="button" class="btn-secondary" style="padding:3px 8px; font-size:11px;" onclick="toggleTodosDevolver(false)">Desmarcar</button>
                                </div>
                            ` : ''}
                        </div>

                        <div id="lista-devolucion-items">
                            ${itemsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cerrarModalDevolucion()">Cancelar</button>
                        <button class="btn-success" onclick="procesarDevolucionSeleccionados('${prestamo.id}')" ${activeCount === 0 ? 'disabled' : ''}>↩️ Confirmar Devolución</button>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('modal-devolucion-overlay');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (err) {
        console.error('Error al abrir modal de devolución:', err);
        alert('❌ Error al cargar detalles del préstamo: ' + err.message);
    }
}

function cerrarModalDevolucion() {
    const el = document.getElementById('modal-devolucion-overlay');
    if (el) el.remove();
}

function toggleTodosDevolver(check) {
    const checkboxes = document.querySelectorAll('.chk-devolver-item:not([disabled])');
    checkboxes.forEach(cb => cb.checked = check);
}

async function procesarDevolucionSeleccionados(prestamoId) {
    const checkboxes = document.querySelectorAll('.chk-devolver-item:checked:not([disabled])');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        alert('⚠️ Por favor selecciona al menos un libro para devolver.');
        return;
    }

    try {
        const fechaHoy = new Date().toISOString();

        const detRes = await tursodb.query(
            `SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`,
            [String(prestamoId)]
        );
        const detalles = detRes.rows || [];

        let reservasAsignadasAlerts = [];

        for (const d of detalles) {
            if (selectedIds.includes(d.id) && d.estado_item === 'prestado') {
                await tursodb.query(
                    `UPDATE biblioteca_prestamo_detalles SET estado_item = 'devuelto', fecha_devolucion_item = ? WHERE id = ?`,
                    [fechaHoy, d.id]
                );

                const isProyecto = d.tipo_item === 'proyecto';
                const tableEjemplares = isProyecto ? 'biblioteca_proyectos_ejemplares' : 'biblioteca_ejemplares';
                const tableCatalog = isProyecto ? 'biblioteca_proyectos' : 'biblioteca_libros';

                // Verificar si hay reservas pendientes para este ejemplar o libro / proyecto
                const resPend = await tursodb.query(
                    `SELECT * FROM biblioteca_reservas 
                     WHERE estado = 'pendiente' 
                       AND (ejemplar_id = ? OR libro_id = ?) 
                     ORDER BY created_at ASC LIMIT 1`,
                    [d.ejemplar_id, d.libro_id]
                );

                if (resPend.rows && resPend.rows.length > 0) {
                    const resAsignada = resPend.rows[0];
                    const exp12h = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

                    await tursodb.query(
                        `UPDATE biblioteca_reservas SET ejemplar_id = ?, fecha_expiracion = ? WHERE id = ?`,
                        [d.ejemplar_id, exp12h, resAsignada.id]
                    );

                    if (d.ejemplar_id) {
                        await tursodb.query(`UPDATE ${tableEjemplares} SET estado = 'reservado' WHERE id = ?`, [d.ejemplar_id]);
                    }

                    reservasAsignadasAlerts.push(`• [${d.libro_codigo}] "${d.libro_titulo}" -> Reservado por ${resAsignada.persona_nombre} (CI: ${resAsignada.persona_ci}) por 12 HORAS.`);
                } else {
                    if (d.ejemplar_id) {
                        await tursodb.query(`UPDATE ${tableEjemplares} SET estado = 'disponible' WHERE id = ?`, [d.ejemplar_id]);
                    }
                    const catRes = await tursodb.query(`SELECT cantidad_total, cantidad_disponible FROM ${tableCatalog} WHERE id = ?`, [d.libro_id]);
                    if (catRes.rows && catRes.rows.length > 0) {
                        const cat = catRes.rows[0];
                        const nDisp = Math.min(cat.cantidad_total || 1, (cat.cantidad_disponible || 0) + 1);
                        await tursodb.query(`UPDATE ${tableCatalog} SET cantidad_disponible = ? WHERE id = ?`, [nDisp, d.libro_id]);
                    }
                }
            }
        }

        const checkRest = await tursodb.query(
            `SELECT COUNT(*) as prestadosCount FROM biblioteca_prestamo_detalles WHERE prestamo_id = ? AND estado_item = 'prestado'`,
            [String(prestamoId)]
        );

        const prestadosCount = checkRest.rows[0]?.prestadosCount || 0;

        let msgFinal = prestadosCount === 0 
            ? `✅ Devolución completa registrada.\nTodos los libros del préstamo han sido devueltos.`
            : `✅ Devolución parcial registrada.\nSe devolvieron ${selectedIds.length} libro(s). Quedan ${prestadosCount} libro(s) pendientes en este préstamo.`;

        if (reservasAsignadasAlerts.length > 0) {
            msgFinal += `\n\n📌 ATENCIÓN DE RESERVAS ASIGNADAS:\nLos siguientes ejemplares fueron apartados por 12 horas para otros usuarios:\n` + reservasAsignadasAlerts.join('\n');
        }

        alert(msgFinal);

        cerrarModalDevolucion();
        await cargarMonitoreoPrestamos();
    } catch (err) {
        console.error('Error al procesar devolución:', err);
        alert('❌ Error al procesar la devolución: ' + err.message);
    }
}

async function devolverPrestamoCompleto(prestamoId) {
    await abrirModalDevolver(prestamoId);
}

// ---------- RENOVACIÓN DE EJEMPLARES INDIVIDUALES ----------

async function abrirModalRenovar(prestamoId) {
    try {
        const pRes = await tursodb.query(`SELECT * FROM biblioteca_prestamos WHERE id = ?`, [String(prestamoId)]);
        if (!pRes.rows || pRes.rows.length === 0) return alert('⚠️ Préstamo no encontrado.');
        const prestamo = pRes.rows[0];

        const detRes = await tursodb.query(`SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`, [String(prestamoId)]);
        const detalles = detRes.rows || [];

        let itemsHtml = '';
        let numRenovables = 0;

        for (const d of detalles) {
            const isDevuelto = d.estado_item === 'devuelto';
            let tieneReserva = false;

            if (!isDevuelto) {
                const resCheck = await tursodb.query(
                    `SELECT COUNT(*) as cant FROM biblioteca_reservas WHERE (libro_id = ? OR ejemplar_id = ?) AND estado = 'pendiente'`,
                    [d.libro_id, d.ejemplar_id]
                );
                if (resCheck.rows && resCheck.rows[0]?.cant > 0) {
                    tieneReserva = true;
                } else {
                    numRenovables++;
                }
            }

            itemsHtml += `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:8px; background:${isDevuelto || tieneReserva ? '#f8fafc' : '#ffffff'};">
                    <div style="display:flex; align-items:center; gap:12px; flex:1;">
                        <input type="checkbox" class="chk-renovar-item" value="${d.id}" ${isDevuelto || tieneReserva ? 'disabled' : 'checked'} style="width:18px; height:18px; cursor:pointer;">
                        <div>
                            <span class="book-code-chip ${isDevuelto ? 'devuelto' : ''}">${escapeHtml(d.libro_codigo)}</span>
                            <strong style="font-size:14px; color:#1e293b;">${escapeHtml(d.libro_titulo)}</strong>
                        </div>
                    </div>
                    <div>
                        ${isDevuelto 
                            ? `<span class="badge badge-success">✓ Devuelto</span>` 
                            : tieneReserva 
                                ? `<span class="badge badge-danger" title="No renovable por reservas pendientes de otros usuarios">⚠️ Reservado (No renovable)</span>` 
                                : `<span class="badge badge-info">Renovable (+70h)</span>`}
                    </div>
                </div>
            `;
        }

        const modalHtml = `
            <div id="modal-renovacion-overlay" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🔄 Renovación de Ejemplares (+70 horas hábiles / 3 días hábiles)</h3>
                        <button class="modal-close-btn" onclick="cerrarModalRenovacion()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="background:#f1f5f9; padding:12px 15px; border-radius:8px; margin-bottom:15px; font-size:13px; color:#334155;">
                            <strong>👤 Usuario:</strong> ${escapeHtml(prestamo.persona_nombre)} (CI: ${escapeHtml(prestamo.persona_ci)})<br>
                            <strong>📅 Límite Actual de Devolución:</strong> ${formatearFechaHora(prestamo.fecha_devolucion_prevista)}
                        </div>

                        <div style="margin-bottom:10px;">
                            <label style="font-weight:bold; font-size:13px; color:#475569;">Selecciona los libros que deseas renovar:</label>
                        </div>

                        <div id="lista-renovacion-items">
                            ${itemsHtml}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" onclick="cerrarModalRenovacion()">Cancelar</button>
                        <button class="btn-info" onclick="procesarRenovacionSeleccionados('${prestamo.id}', '${prestamo.fecha_devolucion_prevista}')" ${numRenovables === 0 ? 'disabled' : ''}>🔄 Confirmar Renovación</button>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('modal-renovacion-overlay');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (err) {
        console.error('Error al abrir modal de renovación:', err);
        alert('❌ Error al cargar detalles para la renovación: ' + err.message);
    }
}

function cerrarModalRenovacion() {
    const el = document.getElementById('modal-renovacion-overlay');
    if (el) el.remove();
}

async function procesarRenovacionSeleccionados(prestamoId, fechaDevolucionActual) {
    const checkboxes = document.querySelectorAll('.chk-renovar-item:checked:not([disabled])');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        alert('⚠️ Por favor selecciona al menos un libro para renovar.');
        return;
    }

    try {
        let fechaBase = new Date();
        if (fechaDevolucionActual && fechaDevolucionActual !== 'undefined' && fechaDevolucionActual !== 'null') {
            fechaBase = parseFecha(fechaDevolucionActual);
        } else {
            const pRes = await tursodb.query(`SELECT fecha_devolucion_prevista FROM biblioteca_prestamos WHERE id = ?`, [String(prestamoId)]);
            if (pRes.rows && pRes.rows.length > 0 && pRes.rows[0].fecha_devolucion_prevista) {
                fechaBase = parseFecha(pRes.rows[0].fecha_devolucion_prevista);
            }
        }

        const nuevaFecha = calcularFechaDevolucion(fechaBase, 70);

        await tursodb.query(
            `UPDATE biblioteca_prestamos SET fecha_devolucion_prevista = ? WHERE id = ?`,
            [nuevaFecha, String(prestamoId)]
        );

        alert(`✅ PRÉSTAMO RENOVADO EXITOSAMENTE\nSe renovaron ${selectedIds.length} libro(s) por 70 horas hábiles (3 días hábiles adicionales).\nLa nueva fecha límite de devolución es: ${formatearFechaHora(nuevaFecha)}`);

        cerrarModalRenovacion();
        if (typeof cargarMonitoreoPrestamos === 'function') await cargarMonitoreoPrestamos();
    } catch (err) {
        console.error('Error al procesar renovación:', err);
        alert('❌ Error al renovar: ' + err.message);
    }
}

async function renovarPrestamo(prestamoId, fechaDevolucionActual = null) {
    await abrirModalRenovar(prestamoId);
}

// ---------- 3. CATÁLOGO E INVENTARIO DE LIBROS (VISTA POR SECCIONES Y PAGINADO 20 EN 20) ----------

const CATALOGO_AREAS_DEF = [
    { cod: "01", nombre: "MINEDU", icon: "🏛️" },
    { cod: "02", nombre: "PROFOCOM", icon: "📘" },
    { cod: "03", nombre: "MATEMÁTICA", icon: "📐" },
    { cod: "04", nombre: "CURRICULUM", icon: "📑" },
    { cod: "05", nombre: "LENGUAJE", icon: "📖" },
    { cod: "06", nombre: "PEDAGOGÍA", icon: "👩‍🏫" },
    { cod: "07", nombre: "DIDÁCTICA", icon: "✏️" },
    { cod: "08", nombre: "INVESTIGACIÓN", icon: "🔍" },
    { cod: "09", nombre: "EDUCACIÓN AMBIENTAL", icon: "🌿" },
    { cod: "10", nombre: "PSICOLOGÍA", icon: "🧠" },
    { cod: "11", nombre: "SOCIOLOGÍA", icon: "👥" },
    { cod: "12", nombre: "CIENCIAS DE LA VIDA", icon: "🧬" },
    { cod: "13", nombre: "QUECHUA", icon: "🗣️" },
    { cod: "14", nombre: "SALUD", icon: "🏥" },
    { cod: "15", nombre: "FILOSOFÍA", icon: "🤔" },
    { cod: "16", nombre: "SOCIALES", icon: "🌎" },
    { cod: "17", nombre: "CULTURA", icon: "🎭" },
    { cod: "18", nombre: "POLÍTICA", icon: "⚖️" },
    { cod: "19", nombre: "OTROS/VARIOS", icon: "📦" },
    { cod: "20", nombre: "AYMARA Y GUARANI", icon: "🗣️" },
    { cod: "21", nombre: "ETICA Y MORAL", icon: "🕊️" },
    { cod: "22", nombre: "BILINGUISMO", icon: "💬" },
    { cod: "23", nombre: "TECNOLOGÍA", icon: "💻" },
    { cod: "24", nombre: "EXPRESIÓN Y CREATIVIDAD", icon: "🎨" },
    { cod: "25", nombre: "HISTORIA", icon: "📜" },
    { cod: "26", nombre: "EDUCACIÓN ESPECIAL", icon: "🤝" },
    { cod: "27", nombre: "DICCIONARIOS Y ENCICLOPEDIAS", icon: "📚" },
    { cod: "28", nombre: "AGRICULTURA", icon: "🌱" },
    { cod: "29", nombre: "OBRAS GENERALES", icon: "📑" }
];

let catalogoEjemplaresMap = {};
let areaPaginasState = {};
let areaExpandidaState = {};

async function cargarCatalogoLibros() {
    const container = document.getElementById('catalogo-areas-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#666; padding:30px;">Cargando catálogo por áreas...</p>';

    const res = await tursodb.query(`SELECT * FROM biblioteca_libros ORDER BY CAST(area_cod AS INTEGER) ASC, CAST(libro_num AS INTEGER) ASC`);
    if (!res.rows || res.rows.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:30px;">No hay libros registrados en el catálogo.</p>';
        return;
    }

    catalogoLibrosCache = res.rows;

    const ejemRes = await tursodb.query(`SELECT libro_id, codigo_ejemplar, estado, ejemplar_num FROM biblioteca_ejemplares ORDER BY ejemplar_num ASC`);
    const todosEjemplares = ejemRes.rows || [];
    
    catalogoEjemplaresMap = {};
    todosEjemplares.forEach(e => {
        if (!catalogoEjemplaresMap[e.libro_id]) catalogoEjemplaresMap[e.libro_id] = [];
        catalogoEjemplaresMap[e.libro_id].push(e);
    });

    renderCatalogoPorAreas(catalogoLibrosCache);
}

function renderCatalogoPorAreas(listaLibros, isFiltered = false) {
    const container = document.getElementById('catalogo-areas-container');
    if (!container) return;

    if (!listaLibros || listaLibros.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:30px; font-style:italic;">No se encontraron libros que coincidan con la búsqueda.</p>';
        return;
    }

    // Agrupar libros por código de área (pad2)
    const librosPorArea = {};
    CATALOGO_AREAS_DEF.forEach(a => { librosPorArea[a.cod] = []; });
    librosPorArea['OTRAS'] = [];

    listaLibros.forEach(b => {
        const areaCodPad = String(b.area_cod || '').trim().padStart(2, '0');
        if (librosPorArea[areaCodPad]) {
            librosPorArea[areaCodPad].push(b);
        } else {
            librosPorArea['OTRAS'].push(b);
        }
    });

    let areasParaMostrar = [...CATALOGO_AREAS_DEF];
    if (librosPorArea['OTRAS'].length > 0) {
        areasParaMostrar.push({ cod: 'OTRAS', nombre: 'Otras Áreas / Sin Clasificar', icon: '📚' });
    }

    const pageSize = 20;

    let html = areasParaMostrar.map(area => {
        const librosArea = librosPorArea[area.cod] || [];
        const totalLibros = librosArea.length;
        
        // Contar total de ejemplares en esta área
        let totalEjemplaresArea = 0;
        let dispEjemplaresArea = 0;
        librosArea.forEach(b => {
            const tot = b.cantidad_total || 1;
            const disp = b.cantidad_disponible !== null ? b.cantidad_disponible : tot;
            totalEjemplaresArea += tot;
            dispEjemplaresArea += disp;
        });

        // Si se está filtrando por búsqueda y el área no tiene coincidencia, ocultarla
        if (isFiltered && totalLibros === 0) return '';

        // Estado de expansión
        const estaExpandida = isFiltered ? (totalLibros > 0) : (areaExpandidaState[area.cod] === true);

        // Paginación de 20 en 20 para esta área
        const totalPages = Math.ceil(totalLibros / pageSize) || 1;
        let currentPage = areaPaginasState[area.cod] || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIndex = (currentPage - 1) * pageSize;
        const pageBooks = librosArea.slice(startIndex, startIndex + pageSize);

        // Renderizado de tabla si el área está expandida
        let tablaContentHtml = '';
        if (estaExpandida) {
            if (totalLibros === 0) {
                tablaContentHtml = `<div style="padding:20px; text-align:center; color:#888; font-style:italic; background:#fff;">No hay libros registrados en esta área de formación.</div>`;
            } else {
                const rowsHtml = pageBooks.map(b => {
                    const total = b.cantidad_total || 1;
                    const disp = b.cantidad_disponible !== null ? b.cantidad_disponible : total;

                    const ejems = catalogoEjemplaresMap[b.id] || [];
                    const codigosList = ejems.map(e => {
                        const st = (e.estado || 'disponible').toLowerCase();
                        let bg = '#d4edda';
                        let color = '#155724';
                        let border = '#c3e6cb';
                        let labelEstado = 'Disponible';

                        if (st === 'prestado') {
                            bg = '#f8d7da'; color = '#721c24'; border = '#f5c6cb'; labelEstado = 'Prestado';
                        } else if (st === 'reservado' || st === 'reservada') {
                            bg = '#e2e3e5'; color = '#383d41'; border = '#d6d8db'; labelEstado = 'Reservado';
                        }

                        return `<span style="font-family:monospace; background:${bg}; color:${color}; border:1px solid ${border}; padding:3px 7px; border-radius:6px; margin:2px 4px 2px 0; font-weight:bold; font-size:12px; display:inline-block;" title="Estado: ${labelEstado}">${e.codigo_ejemplar}</span>`;
                    }).join('');

                    return `
                        <tr>
                            <td><strong>${b.area_cod || '-'}</strong></td>
                            <td><strong>${b.libro_num || '-'}</strong></td>
                            <td>${codigosList || 'Sin códigos'}</td>
                            <td><strong>${safeEscape(b.titulo)}</strong></td>
                            <td>${safeEscape(b.autor || '-')}</td>
                            <td>${safeEscape(b.editorial || '-')}</td>
                            <td>${b.anio || '-'}</td>
                            <td><strong>${disp} / ${total}</strong></td>
                            <td><span class="badge badge-secondary">${b.estado_fisico || 'Bueno'}</span></td>
                            <td>
                                <button onclick="editarLibro('${b.id}')" class="btn-secondary" style="padding:4px 8px; font-size:12px;">✏️ Editar</button>
                                ${disp === 0 ? `<button onclick="solicitarReservaLibro('${b.id}', '${escapeHtml(b.titulo)}')" class="btn-info" style="padding:4px 8px; font-size:12px;">🔖 Reservar</button>` : ''}
                                <button onclick="eliminarLibro('${b.id}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">🗑️</button>
                            </td>
                        </tr>
                    `;
                }).join('');

                // Generar Hojas / Botones de Paginación (20 por página)
                let paginationHtml = '';
                if (totalPages > 1) {
                    let pageBtns = '';
                    for (let p = 1; p <= totalPages; p++) {
                        const isCur = p === currentPage;
                        pageBtns += `
                            <button onclick="cambiarPaginaArea('${area.cod}', ${p})" 
                                    style="padding:5px 10px; margin:0 2px; border-radius:5px; border:1px solid #ccc; font-weight:bold; font-size:12px; cursor:pointer; background:${isCur ? '#007bff' : '#ffffff'}; color:${isCur ? '#ffffff' : '#333333'};">
                                Hoja ${p}
                            </button>
                        `;
                    }

                    const prevDisabled = currentPage === 1;
                    const nextDisabled = currentPage === totalPages;

                    paginationHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px 15px; background:#f8f9fa; border-top:1px solid #eee;">
                            <div style="font-size:13px; color:#555;">
                                Mostrando <strong>${startIndex + 1} - ${Math.min(startIndex + pageSize, totalLibros)}</strong> de <strong>${totalLibros}</strong> libros (Página ${currentPage} de ${totalPages})
                            </div>
                            <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                                <button onclick="cambiarPaginaArea('${area.cod}', ${currentPage - 1})" ${prevDisabled ? 'disabled' : ''} class="btn-secondary" style="padding:4px 9px; font-size:12px;">◀ Anterior</button>
                                ${pageBtns}
                                <button onclick="cambiarPaginaArea('${area.cod}', ${currentPage + 1})" ${nextDisabled ? 'disabled' : ''} class="btn-secondary" style="padding:4px 9px; font-size:12px;">Siguiente ▶</button>
                            </div>
                        </div>
                    `;
                } else {
                    paginationHtml = `
                        <div style="padding:10px 15px; background:#f8f9fa; border-top:1px solid #eee; font-size:12px; color:#666; text-align:right;">
                            Total: <strong>${totalLibros}</strong> libro(s) en esta área.
                        </div>
                    `;
                }

                tablaContentHtml = `
                    <div class="table-responsive">
                        <table class="bib-table">
                            <thead>
                                <tr>
                                    <th>COD</th>
                                    <th>Nº</th>
                                    <th>CÓDIGOS EJEMPLARES</th>
                                    <th>TÍTULO</th>
                                    <th>AUTOR</th>
                                    <th>EDITORIAL</th>
                                    <th>AÑO</th>
                                    <th>EJEMPLARES (Disp / Tot)</th>
                                    <th>ESTADO FÍSICO</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                    ${paginationHtml}
                `;
            }
        }

        return `
            <div id="area-card-${area.cod}" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; margin-bottom:10px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.04);">
                <div onclick="toggleAreaCatalogo('${area.cod}')" 
                     style="padding:13px 18px; background:${estaExpandida ? '#e2e8f0' : '#f8fafc'}; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none; border-bottom:${estaExpandida ? '1px solid #cbd5e1' : 'none'}; transition:background 0.15s;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <strong style="font-size:15px; color:#0f172a;">${area.cod !== 'OTRAS' ? area.cod + ' - ' : ''}${area.icon} ${area.nombre}</strong>
                    </div>
                    <span style="font-size:16px; color:#64748b; font-weight:bold;">${estaExpandida ? '▲' : '▼'}</span>
                </div>
                ${estaExpandida ? tablaContentHtml : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function toggleAreaCatalogo(areaCod) {
    areaExpandidaState[areaCod] = !areaExpandidaState[areaCod];
    filtrarCatalogo();
    if (areaExpandidaState[areaCod]) {
        setTimeout(() => {
            const el = document.getElementById(`area-card-${areaCod}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }
}

function cambiarPaginaArea(areaCod, nuevaPagina) {
    areaPaginasState[areaCod] = nuevaPagina;
    filtrarCatalogo();
    setTimeout(() => {
        const el = document.getElementById(`area-card-${areaCod}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

function expandirTodasAreas() {
    CATALOGO_AREAS_DEF.forEach(a => { areaExpandidaState[a.cod] = true; });
    areaExpandidaState['OTRAS'] = true;
    filtrarCatalogo();
}

function colapsarTodasAreas() {
    areaExpandidaState = {};
    filtrarCatalogo();
}

function filtrarCatalogo() {
    const rawQ = document.getElementById('cat-search-input')?.value.trim().toLowerCase() || '';
    if (!rawQ) {
        renderCatalogoPorAreas(catalogoLibrosCache, false);
        return;
    }

    const cleanQ = rawQ.replace(/['"]/g, '');

    const filtrados = catalogoLibrosCache.filter(b => {
        const area = String(b.area_cod || '').toLowerCase();
        const num = String(b.libro_num || '').toLowerCase();
        const combo = `${pad2(area)}${pad2(num)}`;
        const titulo = String(b.titulo || '').toLowerCase();
        const autor = String(b.autor || '').toLowerCase();
        const edit = String(b.editorial || '').toLowerCase();

        if (area.includes(cleanQ) || num.includes(cleanQ) || combo.includes(cleanQ) || titulo.includes(cleanQ) || autor.includes(cleanQ) || edit.includes(cleanQ)) {
            return true;
        }

        const ejems = catalogoEjemplaresMap[b.id] || [];
        return ejems.some(e => String(e.codigo_ejemplar || '').toLowerCase().includes(cleanQ));
    });

    renderCatalogoPorAreas(filtrados, true);
}

function abrirModalLibro() {
    document.getElementById('form-libro-container').style.display = 'block';
    document.getElementById('form-libro-title').textContent = 'Registrar Nuevo Libro';
    document.getElementById('book-edit-id').value = '';
    document.getElementById('book-input-cod').value = '';
    document.getElementById('book-input-num').value = '';
    document.getElementById('book-input-titulo').value = '';
    document.getElementById('book-input-autor').value = '';
    document.getElementById('book-input-editorial').value = '';
    document.getElementById('book-input-anio').value = '';
    document.getElementById('book-input-ejemplares').value = '1';
    document.getElementById('book-input-estado-fisico').value = 'Bueno';
    actualizarPrevisualizacionCodigos();
}

function cerrarFormLibro() {
    document.getElementById('form-libro-container').style.display = 'none';
}

function editarLibro(id) {
    const b = catalogoLibrosCache.find(x => x.id === id);
    if (!b) return;

    abrirModalLibro();
    document.getElementById('form-libro-title').textContent = `Editar Libro [${b.area_cod}-${b.libro_num}]`;
    document.getElementById('book-edit-id').value = b.id;
    document.getElementById('book-input-cod').value = b.area_cod || '';
    document.getElementById('book-input-num').value = b.libro_num || '';
    document.getElementById('book-input-titulo').value = b.titulo;
    document.getElementById('book-input-autor').value = b.autor || '';
    document.getElementById('book-input-editorial').value = b.editorial || '';
    document.getElementById('book-input-anio').value = b.anio || '';
    document.getElementById('book-input-ejemplares').value = b.cantidad_total || 1;
    document.getElementById('book-input-estado-fisico').value = b.estado_fisico || 'Bueno';
    actualizarPrevisualizacionCodigos();
}

async function guardarLibro() {
    const editId = document.getElementById('book-edit-id').value;
    const rawArea = document.getElementById('book-input-cod').value.trim();
    const rawNum = document.getElementById('book-input-num').value.trim();
    const areaCod = pad2(rawArea);
    const libroNum = pad2(rawNum);
    const titulo = document.getElementById('book-input-titulo').value.trim();
    const autor = document.getElementById('book-input-autor').value.trim();
    const editorial = document.getElementById('book-input-editorial').value.trim();
    const anio = parseInt(document.getElementById('book-input-anio').value) || null;
    const cantTotal = parseInt(document.getElementById('book-input-ejemplares').value) || 1;
    const estadoFisico = document.getElementById('book-input-estado-fisico').value;

    if (!rawArea || !rawNum || !titulo) {
        alert('⚠️ COD (Área), Nº (Libro) y TÍTULO son campos obligatorios');
        return;
    }

    let libroId = editId;

    if (editId) {
        await tursodb.query(
            `UPDATE biblioteca_libros SET area_cod = ?, libro_num = ?, titulo = ?, autor = ?, editorial = ?, anio = ?, cantidad_total = ?, cantidad_disponible = ?, estado_fisico = ? WHERE id = ?`,
            [areaCod, libroNum, titulo, autor, editorial, anio, cantTotal, cantTotal, estadoFisico, editId]
        );
    } else {
        libroId = Date.now().toString();
        await tursodb.query(
            `INSERT INTO biblioteca_libros (id, area_cod, libro_num, titulo, autor, editorial, anio, cantidad_total, cantidad_disponible, estado_fisico)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [libroId, areaCod, libroNum, titulo, autor, editorial, anio, cantTotal, cantTotal, estadoFisico]
        );
    }

    // Generar/Actualizar ejemplares individuales (ej: 010101, 011201, 010102)
    const ejemExist = await tursodb.query(`SELECT * FROM biblioteca_ejemplares WHERE libro_id = ?`, [libroId]);
    const existentes = ejemExist.rows || [];

    for (let i = 1; i <= cantTotal; i++) {
        const codigoEjem = `${areaCod}${libroNum}${pad2(i)}`;
        const ex = existentes.find(e => e.ejemplar_num === i || e.codigo_ejemplar === codigoEjem);
        if (!ex) {
            await tursodb.query(
                `INSERT INTO biblioteca_ejemplares (id, libro_id, codigo_ejemplar, ejemplar_num, estado, estado_fisico)
                 VALUES (?, ?, ?, ?, 'disponible', ?)`,
                [`${libroId}-${i}`, libroId, codigoEjem, i, estadoFisico]
            );
        } else {
            await tursodb.query(
                `UPDATE biblioteca_ejemplares SET codigo_ejemplar = ?, estado_fisico = ? WHERE id = ?`,
                [codigoEjem, estadoFisico, ex.id]
            );
        }
    }

    alert(`✅ LIBRO REGISTRADO CON ÉXITO\nSe generaron ${cantTotal} código(s) de ejemplares: ${areaCod}${libroNum}${pad2(1)} al ${areaCod}${libroNum}${pad2(cantTotal)}`);
    cerrarFormLibro();
    await cargarCatalogoLibros();
}

async function eliminarLibro(id) {
    if (!confirm('¿Estás seguro de eliminar este libro y todos sus ejemplares del catálogo?')) return;
    await tursodb.query(`DELETE FROM biblioteca_ejemplares WHERE libro_id = ?`, [id]);
    await tursodb.query(`DELETE FROM biblioteca_libros WHERE id = ?`, [id]);
    alert('🗑️ Libro y ejemplares eliminados del catálogo');
    await cargarCatalogoLibros();
}

async function verificarYLimpiarReservasExpiradas() {
    try {
        const ahora = new Date().toISOString();
        const res = await tursodb.query(
            `SELECT * FROM biblioteca_reservas WHERE estado = 'pendiente' AND fecha_expiracion IS NOT NULL AND fecha_expiracion < ?`,
            [ahora]
        );
        if (!res.rows || res.rows.length === 0) return;

        for (const r of res.rows) {
            await tursodb.query(`UPDATE biblioteca_reservas SET estado = 'expirada' WHERE id = ?`, [r.id]);
            if (r.ejemplar_id) {
                await tursodb.query(
                    `UPDATE biblioteca_ejemplares SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'`,
                    [r.ejemplar_id]
                );
            }
        }
    } catch (e) {
        console.error('Error al limpiar reservas expiradas:', e);
    }
}

// ---------- 4. COLA DE RESERVAS ----------

async function cargarReservas() {
    await verificarYLimpiarReservasExpiradas();
    const tbody = document.getElementById('reservas-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Cargando reservas...</td></tr>';

    const res = await tursodb.query(
        `SELECT r.*, l.titulo as libro_titulo, l.area_cod, l.libro_num 
         FROM biblioteca_reservas r 
         LEFT JOIN biblioteca_libros l ON r.libro_id = l.id 
         ORDER BY r.created_at DESC`
    );

    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No hay reservas registradas.</td></tr>';
        return;
    }

    reservasCache = res.rows;

    tbody.innerHTML = reservasCache.map(r => {
        let stBadge = '';
        let infoExpiracion = '';
        if (r.estado === 'pendiente') {
            if (r.fecha_expiracion) {
                const msRestantes = new Date(r.fecha_expiracion).getTime() - Date.now();
                if (msRestantes > 0) {
                    const hrs = Math.floor(msRestantes / (1000 * 60 * 60));
                    const mins = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
                    stBadge = `<span class="badge badge-warning">Activa (12h)</span>`;
                    infoExpiracion = `<br><small style="color:#d97706; font-weight:bold;">⏱️ Expira: ${formatearFechaHora(r.fecha_expiracion)} (${hrs}h ${mins}m)</small>`;
                } else {
                    stBadge = `<span class="badge badge-danger">Expirada</span>`;
                    infoExpiracion = `<br><small style="color:#dc2626;">Expiró: ${formatearFechaHora(r.fecha_expiracion)}</small>`;
                }
            } else {
                stBadge = `<span class="badge badge-info">En Cola</span>`;
                infoExpiracion = `<br><small style="color:#64748b;">(En espera de devolución)</small>`;
            }
        } else if (r.estado === 'completada') {
            stBadge = '<span class="badge badge-success">Aprobada / Préstamo</span>';
        } else if (r.estado === 'expirada') {
            stBadge = '<span class="badge badge-danger">Expirada (12h)</span>';
        } else {
            stBadge = '<span class="badge badge-secondary">Cancelada</span>';
        }

        const codigoLibro = (r.area_cod && r.libro_num) ? `[${pad2(r.area_cod)}${pad2(r.libro_num)}] ` : '';
        const tituloLibro = `${codigoLibro}${r.libro_titulo || r.libro_id}`;

        return `
            <tr>
                <td><strong>${tituloLibro}</strong></td>
                <td>${r.persona_nombre}<br><small style="color:#666;">CI: ${r.persona_ci} (${r.persona_tipo})</small></td>
                <td>${formatearFechaHora(r.fecha_reserva)}${infoExpiracion}</td>
                <td>${stBadge}</td>
                <td>
                    ${r.estado === 'pendiente' ? `
                        <button onclick="aprobarReservaYConvertirEnPrestamo('${r.id}')" class="btn-success" style="padding:4px 8px; font-size:12px; margin-right:4px;">✅ Aprobar y Prestar</button>
                        <button onclick="cancelarReserva('${r.id}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">❌ Cancelar</button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

async function aprobarReservaYConvertirEnPrestamo(reservaId) {
    const res = await tursodb.query(`SELECT * FROM biblioteca_reservas WHERE id = ?`, [reservaId]);
    if (!res.rows || res.rows.length === 0) return;
    const r = res.rows[0];

    let itemData = null;
    let isProyecto = false;

    const libRes = await tursodb.query(`SELECT * FROM biblioteca_libros WHERE id = ?`, [r.libro_id]);
    if (libRes.rows && libRes.rows.length > 0) {
        itemData = libRes.rows[0];
    } else {
        const proyRes = await tursodb.query(`SELECT * FROM biblioteca_proyectos WHERE id = ?`, [r.libro_id]);
        if (proyRes.rows && proyRes.rows.length > 0) {
            itemData = proyRes.rows[0];
            isProyecto = true;
        }
    }

    if (!itemData) {
        alert('❌ No se encontró el libro o proyecto asociado a esta reserva.');
        return;
    }

    const tableEjemplares = isProyecto ? 'biblioteca_proyectos_ejemplares' : 'biblioteca_ejemplares';
    const tableCatalog = isProyecto ? 'biblioteca_proyectos' : 'biblioteca_libros';

    let ejemId = r.ejemplar_id;
    let ejemCodigo = r.libro_codigo || '';

    if (ejemId) {
        const eRes = await tursodb.query(`SELECT * FROM ${tableEjemplares} WHERE id = ?`, [ejemId]);
        if (eRes.rows && eRes.rows.length > 0) {
            ejemCodigo = eRes.rows[0].codigo_ejemplar;
        }
    }

    if (!ejemId || !ejemCodigo) {
        const eRes = await tursodb.query(
            `SELECT * FROM ${tableEjemplares} WHERE ${isProyecto ? 'proyecto_id' : 'libro_id'} = ? AND estado IN ('disponible', 'reservado') LIMIT 1`,
            [r.libro_id]
        );
        if (eRes.rows && eRes.rows.length > 0) {
            ejemId = eRes.rows[0].id;
            ejemCodigo = eRes.rows[0].codigo_ejemplar;
        } else {
            alert('❌ No hay ejemplares disponibles para aprobar el préstamo de esta reserva.');
            return;
        }
    }

    const tituloMostrar = r.libro_titulo || itemData.titulo || 'Sin título';

    if (!confirm(`¿Aprobar reserva y crear préstamo activo para ${r.persona_nombre} (CI: ${r.persona_ci}) del ítem "${tituloMostrar}"?`)) return;

    const fechaHoy = new Date().toISOString();
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), 2);
    const prestamoId = Date.now().toString();

    // 1. Crear Préstamo
    await tursodb.query(
        `INSERT INTO biblioteca_prestamos (id, persona_ci, persona_nombre, persona_tipo, fecha_prestamo, fecha_devolucion_prevista, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [prestamoId, r.persona_ci, r.persona_nombre, r.persona_tipo, fechaHoy, fechaDevolucionPrevista]
    );

    // 2. Crear Detalle de Préstamo
    const detalleId = `${prestamoId}-${ejemId}`;
    await tursodb.query(
        `INSERT INTO biblioteca_prestamo_detalles (id, prestamo_id, libro_id, ejemplar_id, libro_codigo, libro_titulo, estado_item, tipo_item)
         VALUES (?, ?, ?, ?, ?, ?, 'prestado', ?)`,
        [detalleId, prestamoId, r.libro_id, ejemId, ejemCodigo, tituloMostrar, isProyecto ? 'proyecto' : 'libro']
    );

    // 3. Marcar ejemplar como prestado y reserva como completada
    await tursodb.query(`UPDATE ${tableEjemplares} SET estado = 'prestado' WHERE id = ?`, [ejemId]);
    await tursodb.query(`UPDATE biblioteca_reservas SET estado = 'completada' WHERE id = ?`, [reservaId]);

    // 4. Actualizar disponibilidad
    const disp = itemData.cantidad_disponible !== null ? itemData.cantidad_disponible : itemData.cantidad_total;
    await tursodb.query(`UPDATE ${tableCatalog} SET cantidad_disponible = ? WHERE id = ?`, [Math.max(0, disp - 1), r.libro_id]);

    alert(`✅ RESERVA APROBADA EXITOSAMENTE\nSe registró el préstamo activo para ${r.persona_nombre}.\nLímite devolución prevista: ${formatearFechaHora(fechaDevolucionPrevista)} (48h hábiles)`);
    await cargarReservas();
}

async function solicitarReservaLibro(libroId, titulo) {
    const ci = prompt(`Ingresa el CI de la persona que desea reservar "${titulo}":`);
    if (!ci) return;

    let nombre = ci;
    let tipo = 'usuario';
    const estRes = await tursodb.query(`SELECT * FROM estudiantes WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
    if (estRes.rows && estRes.rows.length > 0) {
        nombre = `${estRes.rows[0].nombre} ${estRes.rows[0].apellido_paterno}`;
        tipo = 'estudiante';
    }

    // Verificar disponibilidad de ejemplares
    const ejRes = await tursodb.query(`SELECT id FROM biblioteca_ejemplares WHERE libro_id = ? AND estado = 'disponible' LIMIT 1`, [libroId]);
    let ejemId = null;
    let fechaExpiracion = null;
    if (ejRes.rows && ejRes.rows.length > 0) {
        ejemId = ejRes.rows[0].id;
        fechaExpiracion = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'reservado' WHERE id = ?`, [ejemId]);
    }

    const fechaReserva = new Date().toISOString();
    await tursodb.query(
        `INSERT INTO biblioteca_reservas (id, libro_id, ejemplar_id, persona_ci, persona_nombre, persona_tipo, estado, fecha_reserva, fecha_expiracion)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [Date.now().toString(), libroId, ejemId, ci, nombre, tipo, fechaReserva, fechaExpiracion]
    );

    if (ejemId) {
        alert(`🔖 RESERVA REGISTRADA POR 12 HORAS\nSe reservó el ejemplar para ${nombre}.\nTiene 12 horas para ser recogido (expira: ${formatearFechaHora(fechaExpiracion)}).`);
    } else {
        alert(`🔖 RESERVA EN COLA REGISTRADA\nSe registró la reserva para ${nombre}.\nEl libro te será asignado con 12h de tolerancia al ser devuelto.`);
    }
    switchBibTab('reservas');
}

async function cancelarReserva(reservaId) {
    if (!confirm('¿Cancelar esta reserva?')) return;
    await tursodb.query(`UPDATE biblioteca_reservas SET estado = 'cancelada' WHERE id = ?`, [reservaId]);
    await cargarReservas();
}

// ---------- 5. CARGA MASIVA DE LIBROS DESDE EXCEL ----------

let excelParsedRows = [];

function descargarPlantillaExcel() {
    const dataEjemplo = [
        {
            "COD": "01",
            "Nº": "1",
            "AUTOR": "Pérez, Juan",
            "TÍTULO": "Pedagogía y Didáctica General",
            "EDITORIAL": "Santillana",
            "AÑO": 2024,
            "Nº EJEM.": 3,
            "ESTADO": "Bueno"
        },
        {
            "COD": "01",
            "Nº": "2",
            "AUTOR": "Gómez, María",
            "TÍTULO": "Historia de la Educación Boliviana",
            "EDITORIAL": "La Hoguera",
            "AÑO": 2023,
            "Nº EJEM.": 2,
            "ESTADO": "Excelente"
        },
        {
            "COD": "02",
            "Nº": "1",
            "AUTOR": "Rodríguez, Carlos",
            "TÍTULO": "Matemática Aplicada para Secundaria",
            "EDITORIAL": "Don Bosco",
            "AÑO": 2022,
            "Nº EJEM.": 4,
            "ESTADO": "Bueno"
        }
    ];

    const ws = XLSX.utils.json_to_sheet(dataEjemplo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Libros");
    XLSX.writeFile(wb, "Plantilla_Carga_Libros_ESFM.xlsx");
}

function procesarArchivoExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('excel-file-name').textContent = `📄 Archivo seleccionado: ${file.name}`;
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Convertir la hoja a una matriz 2D de filas
            const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (!rawRows || rawRows.length === 0) {
                alert('⚠️ El archivo Excel está vacío.');
                return;
            }

            excelParsedRows = [];
            let totalEjemplaresCount = 0;
            let currentAreaCod = '01';

            // 1. Buscar la fila de cabecera si existe (COD, Nº, TÍTULO)
            let headerRowIndex = -1;
            let colMap = { cod: -1, num: -1, titulo: -1, autor: -1, editorial: -1, anio: -1, ejem: -1, estado: -1 };

            for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
                const row = rawRows[r];
                if (!row) continue;
                for (let c = 0; c < row.length; c++) {
                    const cellVal = String(row[c] || '').toUpperCase().trim();
                    if (cellVal === 'COD' || cellVal.includes('CÓD')) colMap.cod = c;
                    if (cellVal === 'Nº' || cellVal === 'N°' || cellVal === 'NO' || cellVal.includes('NUM')) colMap.num = c;
                    if (cellVal.includes('TITULO') || cellVal.includes('TÍTULO')) colMap.titulo = c;
                    if (cellVal.includes('AUTOR')) colMap.autor = c;
                    if (cellVal.includes('EDITORIAL')) colMap.editorial = c;
                    if (cellVal.includes('AÑO') || cellVal.includes('ANO')) colMap.anio = c;
                    if (cellVal.includes('EJEM') || cellVal.includes('CANTIDAD')) colMap.ejem = c;
                    if (cellVal.includes('ESTADO')) colMap.estado = c;
                }
                if (colMap.titulo !== -1 || (colMap.cod !== -1 && colMap.num !== -1)) {
                    headerRowIndex = r;
                    break;
                }
            }

            const startRowIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

            for (let r = startRowIndex; r < rawRows.length; r++) {
                const row = rawRows[r];
                if (!row || row.length === 0) continue;

                let codRaw = String(row[colMap.cod !== -1 ? colMap.cod : 0] || '').trim();
                let numRaw = String(row[colMap.num !== -1 ? colMap.num : 1] || '').trim();
                let autor = colMap.autor !== -1 ? String(row[colMap.autor] || '').trim() : String(row[2] || '').trim();
                let titulo = colMap.titulo !== -1 ? String(row[colMap.titulo] || '').trim() : String(row[3] || '').trim();
                let editorial = colMap.editorial !== -1 ? String(row[colMap.editorial] || '').trim() : String(row[4] || '').trim();
                let anio = colMap.anio !== -1 ? (parseInt(row[colMap.anio]) || null) : (parseInt(row[5]) || null);
                let cantEjem = colMap.ejem !== -1 ? (parseInt(row[colMap.ejem]) || 1) : (parseInt(row[6]) || 1);
                let estadoRaw = colMap.estado !== -1 ? String(row[colMap.estado] || 'Bueno').trim() : String(row[7] || 'Bueno').trim();

                // Actualizar código de área actual si la celda A contiene un número de área válido (1 o 2 dígitos)
                if (codRaw && /^\d+$/.test(codRaw) && codRaw.length <= 2) {
                    currentAreaCod = pad2(codRaw);
                }

                // Un libro válido DEBE tener un número de libro numérico (Nº en Col B) y un título válido
                if (/^\d+$/.test(numRaw) && titulo && titulo.length > 2 && !numRaw.toUpperCase().includes('Nº')) {
                    const cod = pad2(codRaw && /^\d+$/.test(codRaw) ? codRaw : currentAreaCod);
                    const num = pad2(numRaw);
                    const estado = estadoRaw.toUpperCase().includes('BUENO') || estadoRaw.toUpperCase().includes('ESTADO') ? 'Bueno' : (estadoRaw || 'Bueno');

                    const codigosGenerados = [];
                    for (let i = 1; i <= cantEjem; i++) {
                        codigosGenerados.push(`${cod}${num}${pad2(i)}`);
                    }
                    totalEjemplaresCount += cantEjem;

                    excelParsedRows.push({
                        cod,
                        num,
                        titulo,
                        autor: autor || 'N/A',
                        editorial: editorial || 'N/A',
                        anio,
                        cantEjem,
                        estado,
                        codigosGenerados
                    });
                }
            }

            if (excelParsedRows.length === 0) {
                alert('⚠️ No se encontraron filas válidas en el archivo Excel.');
                return;
            }

            // Mostrar resumen
            document.getElementById('excel-summary-container').style.display = 'block';
            document.getElementById('excel-count-books').textContent = excelParsedRows.length;
            document.getElementById('excel-count-copies').textContent = totalEjemplaresCount;

            // Renderizar tabla de previsualización (limitada a 200 filas para fluidez)
            const tbody = document.getElementById('excel-preview-tbody');
            const previewLimit = 200;
            const rowsToDisplay = excelParsedRows.slice(0, previewLimit);

            tbody.innerHTML = rowsToDisplay.map((r, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${r.cod}</strong></td>
                    <td><strong>${r.num}</strong></td>
                    <td><strong>${r.titulo}</strong></td>
                    <td>${r.autor || '-'}</td>
                    <td>${r.editorial || '-'}</td>
                    <td>${r.anio || '-'}</td>
                    <td><strong>${r.cantEjem}</strong></td>
                    <td><span class="badge badge-secondary">${r.estado}</span></td>
                    <td style="font-family:monospace; font-size:12px; color:#0056b3;">
                        ${r.codigosGenerados.slice(0, 4).join(', ')}${r.codigosGenerados.length > 4 ? '...' : ''}
                    </td>
                </tr>
            `).join('') + (excelParsedRows.length > previewLimit ? `<tr><td colspan="10" style="text-align:center; background:#fff3cd; color:#856404; font-weight:bold;">... y ${excelParsedRows.length - previewLimit} libros más (se importarán todos al confirmar).</td></tr>` : '');

            document.getElementById('btn-confirmar-excel').disabled = false;

        } catch (err) {
            console.error('Error procesando Excel:', err);
            alert('❌ Error al leer el archivo Excel. Asegúrate de subir un archivo válido (.xlsx o .xls).');
        }
    };

    reader.readAsBinaryString(file);
}

async function confirmarCargaMasivaExcel() {
    if (!excelParsedRows || excelParsedRows.length === 0) {
        alert('⚠️ No hay datos listos para importar.');
        return;
    }

    if (!confirm(`¿Confirmar la carga masiva de ${excelParsedRows.length} libros a la base de datos?`)) return;

    const btn = document.getElementById('btn-confirmar-excel');
    btn.disabled = true;
    btn.textContent = `⏳ Cargando ${excelParsedRows.length} libros... Por favor espera...`;

    let creadosLibros = 0;
    let creadosEjemplares = 0;
    let queriesBatch = [];
    const batchSize = 100;

    for (let rIdx = 0; rIdx < excelParsedRows.length; rIdx++) {
        const r = excelParsedRows[rIdx];
        const libroId = `${Date.now()}-${rIdx}`;

        queriesBatch.push({
            sql: `INSERT INTO biblioteca_libros (id, area_cod, libro_num, titulo, autor, editorial, anio, cantidad_total, cantidad_disponible, estado_fisico)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [libroId, r.cod, r.num, r.titulo, r.autor, r.editorial, r.anio, r.cantEjem, r.cantEjem, r.estado]
        });
        creadosLibros++;

        for (let i = 1; i <= r.cantEjem; i++) {
            const codigoEjem = `${r.cod}${r.num}${pad2(i)}`;
            const ejemId = `${libroId}-${i}`;
            queriesBatch.push({
                sql: `INSERT INTO biblioteca_ejemplares (id, libro_id, codigo_ejemplar, ejemplar_num, estado, estado_fisico)
                      VALUES (?, ?, ?, ?, 'disponible', ?)`,
                params: [ejemId, libroId, codigoEjem, i, r.estado]
            });
            creadosEjemplares++;
        }

        if (queriesBatch.length >= batchSize || rIdx === excelParsedRows.length - 1) {
            btn.textContent = `⏳ Cargando... (${creadosLibros}/${excelParsedRows.length} libros procesados)`;
            await tursodb.batchQuery(queriesBatch);
            queriesBatch = [];
        }
    }

    alert(`✅ CARGA MASIVA COMPLETADA CON ÉXITO\nSe registraron ${creadosLibros} libros y ${creadosEjemplares} ejemplares únicos en la base de datos.`);

    excelParsedRows = [];
    document.getElementById('excel-file-input').value = '';
    document.getElementById('excel-file-name').textContent = '';
    document.getElementById('excel-summary-container').style.display = 'none';
    document.getElementById('excel-preview-tbody').innerHTML = '<tr><td colspan="10" style="text-align:center; color:#888;">Carga un archivo Excel para ver la vista previa.</td></tr>';
    btn.textContent = '🚀 Confirmar Carga Masiva a la Base de Datos';

    switchBibTab('catalogo');
}

// ---------- 4. MÓDULO DE PROYECTOS DE GRADO / TESIS ----------

function switchImportMode(mode) {
    const secLibros = document.getElementById('import-section-libros');
    const secProyectos = document.getElementById('import-section-proyectos');
    const btnLibros = document.getElementById('btn-mode-libros');
    const btnProyectos = document.getElementById('btn-mode-proyectos');

    if (mode === 'proyectos') {
        if (secLibros) secLibros.style.display = 'none';
        if (secProyectos) secProyectos.style.display = 'block';
        if (btnLibros) btnLibros.className = 'btn-secondary';
        if (btnProyectos) btnProyectos.className = 'btn-primary';
    } else {
        if (secLibros) secLibros.style.display = 'block';
        if (secProyectos) secProyectos.style.display = 'none';
        if (btnLibros) btnLibros.className = 'btn-primary';
        if (btnProyectos) btnProyectos.className = 'btn-secondary';
    }
}

let excelParsedProyectosRows = [];

function procesarArchivoProyectosExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('excel-proyectos-file-name').textContent = `📄 Archivo seleccionado: ${file.name}`;
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            excelParsedProyectosRows = [];

            if (!rawJson || rawJson.length === 0) {
                renderPrevisualizacionProyectosExcel();
                return;
            }

            // Detección inteligente de columnas desde los encabezados
            let colMap = { cod_esp: -1, num: -1, gestion: -1, titulo: -1, especialidad: -1, modalidad: -1, autores: -1 };
            let headerRowIndex = -1;

            for (let r = 0; r < Math.min(10, rawJson.length); r++) {
                const rowCells = (rawJson[r] || []).map(c => String(c || '').toUpperCase().trim());
                const joined = rowCells.join(' | ');

                if (joined.includes('GESTION') || joined.includes('TITULO') || joined.includes('MODALIDAD') || joined.includes('COD_ESP') || joined.includes('ESPECIALIDAD')) {
                    headerRowIndex = r;
                    rowCells.forEach((cellVal, cIdx) => {
                        if (cellVal.includes('COD_ESP') || cellVal.includes('COD ESP') || cellVal === 'COD') colMap.cod_esp = cIdx;
                        else if (cellVal === 'Nº' || cellVal === 'N°' || cellVal.includes('NUM') || cellVal === 'NO') colMap.num = cIdx;
                        else if (cellVal.includes('GESTION') || cellVal.includes('AÑO') || cellVal.includes('GESTIÓN')) colMap.gestion = cIdx;
                        else if (cellVal.includes('TITULO') || cellVal.includes('TÍTULO') || cellVal.includes('PROYECTO')) colMap.titulo = cIdx;
                        else if (cellVal.includes('ESPECIALIDAD')) colMap.especialidad = cIdx;
                        else if (cellVal.includes('MODALIDAD')) colMap.modalidad = cIdx;
                        else if (cellVal.includes('AUTOR') || cellVal.includes('INTEGRANTE') || cellVal.includes('EQUIPO')) colMap.autores = cIdx;
                    });
                    break;
                }
            }

            for (let i = 0; i < rawJson.length; i++) {
                if (i === headerRowIndex) continue;
                const row = rawJson[i];
                if (!row || row.length === 0) continue;

                const getCell = (idx, fallbackIdx) => {
                    const finalIdx = idx !== -1 ? idx : fallbackIdx;
                    return String(row[finalIdx] || '').trim();
                };

                const rawCodEsp = getCell(colMap.cod_esp, 0);
                const rawNum = getCell(colMap.num, 1);
                const rawGestion = getCell(colMap.gestion, 2);

                if (rawCodEsp.match(/^\d+$/) && rawNum.match(/^\d+$/) && rawGestion.match(/^\d{4}$/)) {
                    const codEsp = pad2(rawCodEsp);
                    const numProj = pad2(rawNum);
                    const gestion = rawGestion;
                    const codigo = `${codEsp}${gestion}${numProj}`;

                    let rawTitulo = getCell(colMap.titulo, 3);
                    let rawEsp = getCell(colMap.especialidad, 4);
                    let rawMod = getCell(colMap.modalidad, 5);
                    let rawAutores = getCell(colMap.autores, 6);

                    // Si la columna 6 estaba vacía y la 7 tenía datos para autores:
                    if (!rawAutores && row[7]) {
                        rawAutores = String(row[7]).trim();
                    }

                    if (rawTitulo.toUpperCase() === 'TITULO' || rawTitulo.toUpperCase() === 'TÍTULO') {
                        continue;
                    }

                    const titulo = rawTitulo.replace(/\s+/g, ' ');
                    const especialidad = rawEsp;
                    const modalidad = rawMod;
                    const autores = rawAutores.replace(/\n/g, ', ').replace(/\s+/g, ' ');

                    excelParsedProyectosRows.push({
                        cod_esp: codEsp,
                        gestion: gestion,
                        proyecto_num: numProj,
                        codigo_proyecto: codigo,
                        titulo: titulo || 'Proyecto de Grado',
                        especialidad: especialidad,
                        modalidad: modalidad,
                        autores: autores
                    });
                }
            }

            renderPrevisualizacionProyectosExcel();
        } catch (err) {
            console.error('Error procesando Excel de proyectos:', err);
            alert('❌ Error al leer el archivo Excel de proyectos: ' + err.message);
        }
    };

    reader.readAsArrayBuffer(file);
}

function renderPrevisualizacionProyectosExcel() {
    const tbody = document.getElementById('excel-proyectos-preview-tbody');
    const summaryContainer = document.getElementById('excel-proyectos-summary-container');
    const countBooksEl = document.getElementById('excel-proyectos-count-books');
    const btnConfirm = document.getElementById('btn-confirmar-excel-proyectos');

    if (!tbody) return;

    if (excelParsedProyectosRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#d9534f; font-weight:bold;">⚠️ No se encontraron proyectos válidos en el Excel. Verifica que contenga las columnas Cod_Esp, Nº, GESTIÓN, TÍTULO, MODALIDAD.</td></tr>';
        if (summaryContainer) summaryContainer.style.display = 'none';
        if (btnConfirm) btnConfirm.disabled = true;
        return;
    }

    if (summaryContainer) summaryContainer.style.display = 'block';
    if (countBooksEl) countBooksEl.textContent = excelParsedProyectosRows.length;
    if (btnConfirm) btnConfirm.disabled = false;

    const previewLimit = 150;
    const previewRows = excelParsedProyectosRows.slice(0, previewLimit);

    tbody.innerHTML = previewRows.map((p, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td><span class="book-code-chip">${p.codigo_proyecto}</span></td>
            <td>${p.cod_esp}</td>
            <td>${p.gestion}</td>
            <td>${p.proyecto_num}</td>
            <td><strong>${escapeHtml(p.titulo)}</strong></td>
            <td>${escapeHtml(p.especialidad || '-')}</td>
            <td><span class="badge badge-secondary" style="background:#6c757d; color:#fff;">${escapeHtml(p.modalidad || '-')}</span></td>
            <td>${escapeHtml(p.autores || '-')}</td>
        </tr>
    `).join('') + (excelParsedProyectosRows.length > previewLimit ? `<tr><td colspan="9" style="text-align:center; background:#fff3cd; color:#856404; font-weight:bold;">... y ${excelParsedProyectosRows.length - previewLimit} proyectos más (se importarán todos al confirmar).</td></tr>` : '');
}

async function confirmarCargaMasivaProyectosExcel() {
    if (!excelParsedProyectosRows || excelParsedProyectosRows.length === 0) {
        alert('⚠️ No hay proyectos para cargar.');
        return;
    }

    if (!confirm(`¿Confirmar la carga masiva de ${excelParsedProyectosRows.length} proyectos a la base de datos?`)) return;

    const btn = document.getElementById('btn-confirmar-excel-proyectos');
    btn.disabled = true;
    btn.textContent = `⏳ Cargando ${excelParsedProyectosRows.length} proyectos... Por favor espera...`;

    try {
        let countProy = 0;
        let countEjem = 0;

        for (let idx = 0; idx < excelParsedProyectosRows.length; idx++) {
            const p = excelParsedProyectosRows[idx];
            const proyId = `proy-${Date.now()}-${idx}`;

            await tursodb.query(
                `INSERT OR REPLACE INTO biblioteca_proyectos (id, cod_esp, gestion, proyecto_num, codigo_proyecto, titulo, especialidad, modalidad, autores, cantidad_total, cantidad_disponible, estado_fisico) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'Bueno')`,
                [proyId, p.cod_esp, p.gestion, p.proyecto_num, p.codigo_proyecto, p.titulo, p.especialidad, p.modalidad || '', p.autores]
            );
            countProy++;

            const ejemId = `proyejem-${proyId}-1`;
            await tursodb.query(
                `INSERT OR REPLACE INTO biblioteca_proyectos_ejemplares (id, proyecto_id, codigo_ejemplar, ejemplar_num, estado, estado_fisico) VALUES (?, ?, ?, 1, 'disponible', 'Bueno')`,
                [ejemId, proyId, p.codigo_proyecto]
            );
            countEjem++;
        }

        alert(`✅ CARGA MASIVA DE PROYECTOS EXITOSA\nSe registraron ${countProy} proyectos y ${countEjem} ejemplares con código único de 8 dígitos.`);
        btn.textContent = '🚀 Confirmar Carga Masiva de Proyectos a la BD';
        btn.disabled = false;
        excelParsedProyectosRows = [];
        document.getElementById('excel-proyectos-file-name').textContent = '';
        document.getElementById('excel-proyectos-preview-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center; color:#888;">Carga completada. Selecciona un nuevo archivo si deseas continuar.</td></tr>';
        document.getElementById('excel-proyectos-summary-container').style.display = 'none';

        switchBibTab('proyectos');
    } catch (err) {
        console.error('Error en carga masiva de proyectos:', err);
        alert('❌ Error al insertar proyectos en la base de datos: ' + err.message);
        btn.disabled = false;
        btn.textContent = '🚀 Confirmar Carga Masiva de Proyectos a la BD';
    }
}

// ---------- CATÁLOGO DE PROYECTOS ----------

let catalogoProyectosCache = [];
let catalogoProyectosEjemplaresMap = {};

async function cargarCatalogoProyectos() {
    const tbody = document.getElementById('proyectos-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#666;">Cargando proyectos...</td></tr>';

    const res = await tursodb.query(`SELECT * FROM biblioteca_proyectos ORDER BY gestion DESC, CAST(cod_esp AS INTEGER) ASC, CAST(proyecto_num AS INTEGER) ASC`);
    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#888;">No hay proyectos registrados en el catálogo. Usa el botón de arriba o la sección de Carga Masiva para registrar proyectos.</td></tr>';
        return;
    }

    catalogoProyectosCache = res.rows;

    const ejemRes = await tursodb.query(`SELECT proyecto_id, codigo_ejemplar, estado, ejemplar_num FROM biblioteca_proyectos_ejemplares ORDER BY ejemplar_num ASC`);
    const todosEjemplares = ejemRes.rows || [];

    catalogoProyectosEjemplaresMap = {};
    todosEjemplares.forEach(e => {
        if (!catalogoProyectosEjemplaresMap[e.proyecto_id]) catalogoProyectosEjemplaresMap[e.proyecto_id] = [];
        catalogoProyectosEjemplaresMap[e.proyecto_id].push(e);
    });

    renderTablaProyectos(catalogoProyectosCache);
}

function renderTablaProyectos(lista) {
    const tbody = document.getElementById('proyectos-table-body');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#888;">No se encontraron proyectos con los filtros seleccionados.</td></tr>';
        return;
    }

    const limit = 200;
    const listaRender = lista.slice(0, limit);

    let rowsHtml = listaRender.map(p => {
        const total = p.cantidad_total || 1;
        const disp = p.cantidad_disponible !== null ? p.cantidad_disponible : total;

        const ejems = catalogoProyectosEjemplaresMap[p.id] || [];
        const codigosList = ejems.map(e => {
            const st = (e.estado || 'disponible').toLowerCase();
            let bg = '#d4edda'; let color = '#155724'; let border = '#c3e6cb'; let labelEstado = 'Disponible';
            if (st === 'prestado') { bg = '#f8d7da'; color = '#721c24'; border = '#f5c6cb'; labelEstado = 'Prestado'; }
            else if (st === 'reservado' || st === 'reservada') { bg = '#e2e3e5'; color = '#383d41'; border = '#d6d8db'; labelEstado = 'Reservado'; }
            return `<span style="font-family:monospace; background:${bg}; color:${color}; border:1px solid ${border}; padding:3px 7px; border-radius:6px; margin:2px 4px 2px 0; font-weight:bold; font-size:12px; display:inline-block;" title="Estado: ${labelEstado}">${e.codigo_ejemplar}</span>`;
        }).join('');

        return `
            <tr>
                <td>${codigosList || `<span class="book-code-chip">${p.codigo_proyecto}</span>`}</td>
                <td><strong>${p.gestion || '-'}</strong></td>
                <td><span class="badge badge-info">${escapeHtml(p.especialidad || 'Especialidad')}</span></td>
                <td><span class="badge badge-secondary" style="background:#6c757d; color:#fff;">${escapeHtml(p.modalidad || '-')}</span></td>
                <td><strong>${escapeHtml(p.titulo)}</strong></td>
                <td>${escapeHtml(p.autores || 'N/A')}</td>
                <td><strong>${disp} / ${total}</strong></td>
                <td><span class="badge badge-secondary">${p.estado_fisico || 'Bueno'}</span></td>
                <td>
                    <button onclick="editarProyecto('${p.id}')" class="btn-secondary" style="padding:4px 8px; font-size:12px;">✏️ Editar</button>
                    <button onclick="eliminarProyecto('${p.id}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');

    if (lista.length > limit) {
        rowsHtml += `<tr><td colspan="9" style="text-align:center; background:#fff3cd; color:#856404; font-weight:bold;">Mostrando primeros ${limit} proyectos de ${lista.length} registrados. Usa el buscador arriba para filtrar.</td></tr>`;
    }

    tbody.innerHTML = rowsHtml;
}

function filtrarCatalogoProyectos() {
    const q = document.getElementById('proy-search-input').value.toLowerCase().trim();
    const stGestion = document.getElementById('proy-filter-gestion').value;

    const filtrados = catalogoProyectosCache.filter(p => {
        const matchQ = p.codigo_proyecto.toLowerCase().includes(q) ||
                       p.titulo.toLowerCase().includes(q) ||
                       (p.autores || '').toLowerCase().includes(q) ||
                       (p.especialidad || '').toLowerCase().includes(q) ||
                       (p.modalidad || '').toLowerCase().includes(q);

        let matchGestion = true;
        if (stGestion) matchGestion = String(p.gestion) === stGestion;

        return matchQ && matchGestion;
    });

    renderTablaProyectos(filtrados);
}

function abrirModalProyecto() {
    document.getElementById('form-proyecto-container').style.display = 'block';
    document.getElementById('form-proyecto-title').textContent = 'Registrar Nuevo Proyecto';
    document.getElementById('proy-edit-id').value = '';
    document.getElementById('proy-input-esp').value = '';
    document.getElementById('proy-input-gestion').value = new Date().getFullYear();
    document.getElementById('proy-input-num').value = '';
    document.getElementById('proy-input-titulo').value = '';
    document.getElementById('proy-input-especialidad').value = '';
    document.getElementById('proy-input-modalidad').value = '';
    document.getElementById('proy-input-autores').value = '';
    actualizarPrevisualizacionCodigoProyecto();
}

function cerrarFormProyecto() {
    document.getElementById('form-proyecto-container').style.display = 'none';
}

function actualizarPrevisualizacionCodigoProyecto() {
    const esp = pad2(document.getElementById('proy-input-esp')?.value.trim());
    const gestion = String(document.getElementById('proy-input-gestion')?.value.trim() || '');
    const num = pad2(document.getElementById('proy-input-num')?.value.trim());
    const prevEl = document.getElementById('proy-code-preview');
    if (!prevEl) return;

    if (!esp || !gestion || !num) {
        prevEl.textContent = '🏷️ Código que se generará: (Ingresa Cod_Esp, Gestión y Nº)';
        return;
    }

    prevEl.textContent = `🏷️ Código que se generará: ${esp}${gestion}${num}`;
}

async function guardarProyecto() {
    const editId = document.getElementById('proy-edit-id').value;
    const esp = pad2(document.getElementById('proy-input-esp').value.trim());
    const gestion = document.getElementById('proy-input-gestion').value.trim();
    const num = pad2(document.getElementById('proy-input-num').value.trim());
    const titulo = document.getElementById('proy-input-titulo').value.trim();
    const especialidad = document.getElementById('proy-input-especialidad').value.trim();
    const modalidad = document.getElementById('proy-input-modalidad').value.trim();
    const autores = document.getElementById('proy-input-autores').value.trim();

    if (!esp || !gestion || !num || !titulo) {
        alert('⚠️ Por favor completa los campos obligatorios: Cod_Esp, Gestión, Nº y Título.');
        return;
    }

    const codigoProyecto = `${esp}${gestion}${num}`;

    try {
        if (editId) {
            await tursodb.query(
                `UPDATE biblioteca_proyectos SET cod_esp = ?, gestion = ?, proyecto_num = ?, codigo_proyecto = ?, titulo = ?, especialidad = ?, modalidad = ?, autores = ? WHERE id = ?`,
                [esp, gestion, num, codigoProyecto, titulo, especialidad, modalidad, autores, editId]
            );

            await tursodb.query(
                `UPDATE biblioteca_proyectos_ejemplares SET codigo_ejemplar = ? WHERE proyecto_id = ?`,
                [codigoProyecto, editId]
            );

            alert('✅ Proyecto actualizado correctamente.');
        } else {
            const proyId = `proy-${Date.now()}`;
            await tursodb.query(
                `INSERT INTO biblioteca_proyectos (id, cod_esp, gestion, proyecto_num, codigo_proyecto, titulo, especialidad, modalidad, autores, cantidad_total, cantidad_disponible, estado_fisico) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'Bueno')`,
                [proyId, esp, gestion, num, codigoProyecto, titulo, especialidad, modalidad, autores]
            );

            await tursodb.query(
                `INSERT INTO biblioteca_proyectos_ejemplares (id, proyecto_id, codigo_ejemplar, ejemplar_num, estado, estado_fisico) VALUES (?, ?, ?, 1, 'disponible', 'Bueno')`,
                [`proyejem-${proyId}-1`, proyId, codigoProyecto]
            );

            alert('✅ Proyecto registrado con éxito. Código asignado: ' + codigoProyecto);
        }

        cerrarFormProyecto();
        await cargarCatalogoProyectos();
    } catch (err) {
        console.error('Error al guardar proyecto:', err);
        alert('❌ Error al guardar proyecto: ' + err.message);
    }
}

function editarProyecto(id) {
    const p = catalogoProyectosCache.find(x => x.id === id);
    if (!p) return;

    abrirModalProyecto();
    document.getElementById('form-proyecto-title').textContent = `Editar Proyecto [${p.codigo_proyecto}]`;
    document.getElementById('proy-edit-id').value = p.id;
    document.getElementById('proy-input-esp').value = p.cod_esp || '';
    document.getElementById('proy-input-gestion').value = p.gestion || '';
    document.getElementById('proy-input-num').value = p.proyecto_num || '';
    document.getElementById('proy-input-titulo').value = p.titulo || '';
    document.getElementById('proy-input-especialidad').value = p.especialidad || '';
    document.getElementById('proy-input-modalidad').value = p.modalidad || '';
    document.getElementById('proy-input-autores').value = p.autores || '';
    actualizarPrevisualizacionCodigoProyecto();
}

async function eliminarProyecto(id) {
    if (!confirm('¿Estás seguro de eliminar este proyecto del catálogo?')) return;
    try {
        await tursodb.query(`DELETE FROM biblioteca_proyectos_ejemplares WHERE proyecto_id = ?`, [id]);
        await tursodb.query(`DELETE FROM biblioteca_proyectos WHERE id = ?`, [id]);
        alert('🗑️ Proyecto eliminado del catálogo.');
        await cargarCatalogoProyectos();
    } catch (err) {
        console.error('Error al eliminar proyecto:', err);
        alert('❌ Error al eliminar: ' + err.message);
    }
}

async function solicitarPinAdminConfirmacion(mensajeOperacion) {
    const pin = prompt(`🔐 CONFIRMACIÓN DE SEGURIDAD (ADMIN)\n\n${mensajeOperacion}\n\nIngresa el PIN de Administrador para confirmar y autorizar esta acción:`);
    if (pin === null) return false;

    const pinClean = pin.trim();
    if (!pinClean) {
        alert('⚠️ Debes ingresar el PIN de administrador.');
        return false;
    }

    try {
        const hash = await hashPin(pinClean);
        if (typeof ADMIN_PIN_HASH !== 'undefined' && hash === ADMIN_PIN_HASH) {
            return true;
        } else {
            alert('❌ PIN de Administrador incorrecto. Operación cancelada por seguridad.');
            return false;
        }
    } catch (e) {
        console.error('Error verificando PIN:', e);
        alert('❌ Error de verificación de seguridad.');
        return false;
    }
}

async function vaciarBDLibros() {
    if (!confirm('⚠️ ¿ATENCIÓN! ¿Estás seguro de ELIMINAR TODOS LOS LIBROS Y EJEMPLARES de la base de datos?\nEsta acción vaciará por completo el inventario de libros.')) return;

    const autorizado = await solicitarPinAdminConfirmacion('Estás a punto de eliminar por completo la Base de Datos de Libros y Ejemplares.');
    if (!autorizado) return;

    try {
        await tursodb.query(`DELETE FROM biblioteca_ejemplares`);
        await tursodb.query(`DELETE FROM biblioteca_libros`);
        alert('🗑️ Base de Datos de Libros y Ejemplares eliminada por completo.');
        await cargarCatalogoLibros();
    } catch (err) {
        console.error('Error al vaciar BD de libros:', err);
        alert('❌ Error al vaciar BD de libros: ' + err.message);
    }
}

async function vaciarBDProyectos() {
    if (!confirm('⚠️ ¿ATENCIÓN! ¿Estás seguro de ELIMINAR TODOS LOS PROYECTOS de la base de datos?\nEsta acción vaciará por completo el catálogo de proyectos.')) return;

    const autorizado = await solicitarPinAdminConfirmacion('Estás a punto de eliminar por completo la Base de Datos de Proyectos.');
    if (!autorizado) return;

    try {
        await tursodb.query(`DELETE FROM biblioteca_proyectos_ejemplares`);
        await tursodb.query(`DELETE FROM biblioteca_proyectos`);
        alert('🗑️ Base de Datos de Proyectos eliminada por completo.');
        await cargarCatalogoProyectos();
    } catch (err) {
        console.error('Error al vaciar BD de proyectos:', err);
        alert('❌ Error al vaciar BD de proyectos: ' + err.message);
    }
}
