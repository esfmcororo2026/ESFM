// ========== BIBLIOTECA ==========

let eventoActivoBib = null;

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) { window.location.href = '../index.html'; return; }
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
    await tursodb.query(`
        CREATE TABLE IF NOT EXISTS biblioteca_reservas (
            id TEXT PRIMARY KEY,
            libro_id TEXT NOT NULL,
            persona_ci TEXT NOT NULL,
            persona_nombre TEXT NOT NULL,
            persona_tipo TEXT NOT NULL,
            estado TEXT DEFAULT 'pendiente',
            fecha_reserva TEXT DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
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

// Helper: Calcular fecha límite de devolución considerando solo días hábiles (Lunes a Viernes)
function calcularFechaDevolucion(fechaInicio = new Date(), diasHabiles = 3) {
    let fecha = new Date(fechaInicio);
    let agregados = 0;
    while (agregados < diasHabiles) {
        fecha.setDate(fecha.getDate() + 1);
        const diaSemana = fecha.getDay(); // 0 = Domingo, 6 = Sábado
        if (diaSemana !== 0 && diaSemana !== 6) {
            agregados++;
        }
    }
    return fecha.toISOString().split('T')[0];
}

// Formatear fechas para UI
function formatearFecha(fechaStr) {
    if (!fechaStr) return '--';
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return fechaStr;
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

    resultsEl.innerHTML = '<p style="color:#666; font-size:13px;">Buscando ejemplares...</p>';

    const cleanQ = rawQ.replace(/['"]/g, '');

    // Construir variantes normalizadas del código si parece un código numérico
    // El formato es: AA BB CC (área 2 dig + libro 2 dig + ejemplar 2 dig = 6 dígitos)
    const searchVariants = [cleanQ];
    if (/^\d+$/.test(cleanQ)) {
        // Si tiene 6 dígitos exactos, buscar directo
        if (cleanQ.length === 6) {
            searchVariants.push(cleanQ);
        }
        // Si tiene menos de 6 dígitos, intentar normalizar como prefijo de código
        if (cleanQ.length <= 4) {
            // Dividir en grupos de 2 dígitos y reconstruir con pad2
            const parts = [];
            for (let i = 0; i < cleanQ.length; i += 2) {
                parts.push(pad2(cleanQ.slice(i, i + 2)));
            }
            const normalized = parts.join('');
            if (!searchVariants.includes(normalized)) searchVariants.push(normalized);
        }
        // También buscar como si fueran los primeros N dígitos del código de 6
        const padded = cleanQ.padStart(2, '0');
        if (!searchVariants.includes(padded)) searchVariants.push(padded);
    }

    // Construir condición LIKE para todas las variantes
    const likeConditions = searchVariants.map(() =>
        `e.codigo_ejemplar LIKE ?`
    ).join(' OR ');

    const likeParams = searchVariants.map(v => `${v}%`);

    // 1. Búsqueda por código y texto (título, autor)
    let ejemRes = await tursodb.query(
        `SELECT e.id as ejem_id, e.codigo_ejemplar, e.ejemplar_num, e.estado as ejem_estado,
                l.id as libro_id, l.titulo, l.autor, l.editorial, l.area_cod, l.libro_num 
         FROM biblioteca_ejemplares e 
         JOIN biblioteca_libros l ON e.libro_id = l.id 
         WHERE ${likeConditions}
            OR e.codigo_ejemplar LIKE ?
            OR l.titulo LIKE ?
            OR l.autor LIKE ?
            OR l.editorial LIKE ?
         LIMIT 30`,
        [...likeParams, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`]
    );

    let rows = ejemRes.rows || [];

    // 2. Si no hay resultados y hay varias palabras, buscar por palabras clave
    if (rows.length === 0 && cleanQ.includes(' ')) {
        const words = cleanQ.split(/\s+/).filter(w => w.length >= 3).slice(0, 4);
        if (words.length > 0) {
            const conditions = words.map(() => `(l.titulo LIKE ? OR l.autor LIKE ? OR e.codigo_ejemplar LIKE ?)`).join(' AND ');
            const params = [];
            words.forEach(w => {
                params.push(`%${w}%`, `%${w}%`, `%${w}%`);
            });

            ejemRes = await tursodb.query(
                `SELECT e.id as ejem_id, e.codigo_ejemplar, e.ejemplar_num, e.estado as ejem_estado,
                        l.id as libro_id, l.titulo, l.autor, l.editorial, l.area_cod, l.libro_num 
                 FROM biblioteca_ejemplares e 
                 JOIN biblioteca_libros l ON e.libro_id = l.id 
                 WHERE ${conditions}
                 LIMIT 30`,
                params
            );
            rows = ejemRes.rows || [];
        }
    }

    if (rows.length === 0) {
        resultsEl.innerHTML = '<p style="color:#888; font-size:13px; font-style:italic;">No se encontraron ejemplares. Intenta por código (ej: <b>010101</b>) o palabras del título.</p>';
        return;
    }

    resultsEl.innerHTML = rows.map(item => {
        const enCarrito = cartItems.some(c => c.ejemId === item.ejem_id);
        const estaDisponible = item.ejem_estado === 'disponible';
        const disabled = !estaDisponible || enCarrito;
        const btnText = enCarrito ? 'En Carrito' : (!estaDisponible ? `[${item.ejem_estado.toUpperCase()}]` : '+ Agregar');

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid #eee; background:#fff;">
                <div style="font-size:13px;">
                    <strong style="color:#007bff;">[${item.codigo_ejemplar}]</strong> ${item.titulo} <small style="color:#666;">(Ejemplar #${item.ejemplar_num})</small><br>
                    <small style="color:#666;">Área: ${item.area_cod || '-'} | Libro Nº: ${item.libro_num || '-'} | Autor: ${item.autor || 'N/A'}</small>
                </div>
                <button onclick="agregarAlCarrito('${item.ejem_id}', '${item.libro_id}', '${escapeHtml(item.codigo_ejemplar)}', '${escapeHtml(item.titulo)} (#${item.ejemplar_num})')" 
                        class="${disabled ? 'btn-secondary' : 'btn-success'}" 
                        style="padding:5px 10px; font-size:12px;" ${disabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

function agregarAlCarrito(ejemId, libroId, codigo, titulo) {
    if (cartItems.some(i => i.ejemId === ejemId)) return;
    cartItems.push({ ejemId, libroId, codigo, titulo });
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

    if (countEl) countEl.textContent = cartItems.length;

    const fechaPrevista = calcularFechaDevolucion(new Date(), 3);
    if (deadlineEl) {
        deadlineEl.textContent = `Fecha límite de devolución: ${formatearFecha(fechaPrevista)} (3 días hábiles)`;
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

    const fechaHoy = new Date().toISOString().split('T')[0];
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), 3);
    const prestamoId = Date.now().toString();

    // 1. Insertar Cabecera de Préstamo
    await tursodb.query(
        `INSERT INTO biblioteca_prestamos (id, persona_ci, persona_nombre, persona_tipo, fecha_prestamo, fecha_devolucion_prevista, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [prestamoId, cartUser.ci, cartUser.nombre, cartUser.tipo, fechaHoy, fechaDevolucionPrevista]
    );

    // 2. Insertar Detalle de Libros y Marcar Ejemplar como 'prestado'
    for (const item of cartItems) {
        const detalleId = `${prestamoId}-${item.ejemId}`;
        await tursodb.query(
            `INSERT INTO biblioteca_prestamo_detalles (id, prestamo_id, libro_id, ejemplar_id, libro_codigo, libro_titulo, estado_item)
             VALUES (?, ?, ?, ?, ?, ?, 'prestado')`,
            [detalleId, prestamoId, item.libroId, item.ejemId, item.codigo, item.titulo]
        );

        // Actualizar estado del ejemplar
        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'prestado' WHERE id = ?`, [item.ejemId]);

        // Actualizar stock disponible en biblioteca_libros
        const libRes = await tursodb.query(`SELECT cantidad_disponible FROM biblioteca_libros WHERE id = ?`, [item.libroId]);
        if (libRes.rows && libRes.rows.length > 0) {
            const currentDisp = libRes.rows[0].cantidad_disponible || 0;
            await tursodb.query(`UPDATE biblioteca_libros SET cantidad_disponible = ? WHERE id = ?`, [Math.max(0, currentDisp - 1), item.libroId]);
        }
    }

    alert(`✅ PRÉSTAMO REGISTRADO CON ÉXITO\nSe prestaron ${cartItems.length} ejemplar(es) a ${cartUser.nombre}.\nFecha de devolución: ${formatearFecha(fechaDevolucionPrevista)}`);

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
    const hoy = new Date().toISOString().split('T')[0];

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

        const librosText = detalles.map(d => {
            const st = d.estado_item === 'devuelto' ? ' <small style="color:green;">(Devuelto)</small>' : '';
            return `• <strong>[${d.libro_codigo}]</strong> ${d.libro_titulo}${st}`;
        }).join('<br>');

        let estadoBadge = '';
        if (p.estado === 'devuelto') {
            estadoBadge = '<span class="badge badge-success">Devuelto</span>';
        } else if (p.fecha_devolucion_prevista < hoy) {
            estadoBadge = '<span class="badge badge-danger">⚠️ Vencido</span>';
        } else {
            estadoBadge = '<span class="badge badge-warning">En Préstamo</span>';
        }

        const esActivo = p.estado === 'activo';

        rowsHtml += `
            <tr>
                <td>
                    <strong>${p.persona_nombre}</strong><br>
                    <small style="color:#666;">CI: ${p.persona_ci} (${p.persona_tipo})</small>
                </td>
                <td>${librosText || 'Sin detalles'}</td>
                <td>${formatearFecha(p.fecha_prestamo)}</td>
                <td><strong>${formatearFecha(p.fecha_devolucion_prevista)}</strong></td>
                <td>${estadoBadge}</td>
                <td>
                    ${esActivo ? `
                        <button onclick="devolverPrestamoCompleto('${p.id}')" class="btn-success" style="padding:4px 8px; font-size:12px; margin-bottom:3px;">↩️ Devolver</button>
                        <button onclick="renovarPrestamo('${p.id}')" class="btn-info" style="padding:4px 8px; font-size:12px;">🔄 Renovar</button>
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
    const hoy = new Date().toISOString().split('T')[0];

    const filtrados = prestamosCache.filter(p => {
        const matchQ = p.persona_nombre.toLowerCase().includes(q) || p.persona_ci.toLowerCase().includes(q);
        let matchSt = true;
        if (st === 'activo') matchSt = p.estado === 'activo' && p.fecha_devolucion_prevista >= hoy;
        if (st === 'vencido') matchSt = p.estado === 'activo' && p.fecha_devolucion_prevista < hoy;
        if (st === 'devuelto') matchSt = p.estado === 'devuelto';
        return matchQ && matchSt;
    });

    renderTablaMonitoreo(filtrados);
}

async function devolverPrestamoCompleto(prestamoId) {
    if (!confirm('¿Confirmar la devolución de todos los libros de este préstamo?')) return;

    const fechaHoy = new Date().toISOString().split('T')[0];

    const detRes = await tursodb.query(`SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`, [prestamoId]);
    const detalles = detRes.rows || [];

    for (const d of detalles) {
        if (d.estado_item === 'prestado') {
            await tursodb.query(
                `UPDATE biblioteca_prestamo_detalles SET estado_item = 'devuelto', fecha_devolucion_item = ? WHERE id = ?`,
                [fechaHoy, d.id]
            );

            // Restaurar estado del ejemplar
            if (d.ejemplar_id) {
                await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'disponible' WHERE id = ?`, [d.ejemplar_id]);
            }

            // Incrementar stock disponible en la obra
            const libRes = await tursodb.query(`SELECT cantidad_total, cantidad_disponible FROM biblioteca_libros WHERE id = ?`, [d.libro_id]);
            if (libRes.rows && libRes.rows.length > 0) {
                const lib = libRes.rows[0];
                const nDisp = Math.min(lib.cantidad_total || 1, (lib.cantidad_disponible || 0) + 1);
                await tursodb.query(`UPDATE biblioteca_libros SET cantidad_disponible = ? WHERE id = ?`, [nDisp, d.libro_id]);
            }
        }
    }

    await tursodb.query(
        `UPDATE biblioteca_prestamos SET estado = 'devuelto', fecha_devolucion_real = ? WHERE id = ?`,
        [fechaHoy, prestamoId]
    );

    alert('✅ Devolución registrada correctamente. Ejemplares y stock restaurados.');
    await cargarMonitoreoPrestamos();
}

async function renovarPrestamo(prestamoId) {
    const detRes = await tursodb.query(`SELECT libro_id, libro_titulo FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`, [prestamoId]);
    const detalles = detRes.rows || [];

    let libroConDemanda = null;
    for (const d of detalles) {
        const resCheck = await tursodb.query(
            `SELECT COUNT(*) as cant FROM biblioteca_reservas WHERE libro_id = ? AND estado = 'pendiente'`,
            [d.libro_id]
        );
        if (resCheck.rows && resCheck.rows[0] && resCheck.rows[0].cant > 0) {
            libroConDemanda = d.libro_titulo;
            break;
        }
    }

    if (libroConDemanda) {
        alert(`⚠️ NO SE PUEDE RENOVAR EL PRÉSTAMO:\nEl libro "${libroConDemanda}" tiene reservas pendientes por otros usuarios.\nPor políticas de biblioteca, el libro debe ser devuelto.`);
        return;
    }

    const nuevaFecha = calcularFechaDevolucion(new Date(), 3);
    await tursodb.query(
        `UPDATE biblioteca_prestamos SET fecha_devolucion_prevista = ? WHERE id = ?`,
        [nuevaFecha, prestamoId]
    );

    alert(`✅ PRÉSTAMO RENOVADO EXITOSAMENTE\nLa nueva fecha límite de devolución es: ${formatearFecha(nuevaFecha)}`);
    await cargarMonitoreoPrestamos();
}

// ---------- 3. CATÁLOGO E INVENTARIO DE LIBROS ----------

async function cargarCatalogoLibros() {
    const tbody = document.getElementById('catalogo-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#666;">Cargando catálogo...</td></tr>';

    const res = await tursodb.query(`SELECT * FROM biblioteca_libros ORDER BY created_at DESC`);
    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#888;">No hay libros registrados en el catálogo.</td></tr>';
        return;
    }

    catalogoLibrosCache = res.rows;
    await renderTablaCatalogo(catalogoLibrosCache);
}

async function renderTablaCatalogo(lista) {
    const tbody = document.getElementById('catalogo-table-body');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#888;">No se encontraron libros.</td></tr>';
        return;
    }

    // Traer todos los ejemplares en 1 sola consulta para rendimiento instantáneo
    const ejemRes = await tursodb.query(`SELECT libro_id, codigo_ejemplar, estado, ejemplar_num FROM biblioteca_ejemplares ORDER BY ejemplar_num ASC`);
    const todosEjemplares = ejemRes.rows || [];
    
    // Agrupar por libro_id
    const mapEjemplares = {};
    todosEjemplares.forEach(e => {
        if (!mapEjemplares[e.libro_id]) mapEjemplares[e.libro_id] = [];
        mapEjemplares[e.libro_id].push(e);
    });

    // Mostrar un límite de 200 filas para fluidez del DOM
    const limit = 200;
    const listaRender = lista.slice(0, limit);

    let rowsHtml = listaRender.map(b => {
        const total = b.cantidad_total || 1;
        const disp = b.cantidad_disponible !== null ? b.cantidad_disponible : total;

        const ejems = mapEjemplares[b.id] || [];
        const codigosList = ejems.map(e => {
            const color = e.estado === 'disponible' ? '#155724' : '#721c24';
            const bg = e.estado === 'disponible' ? '#d4edda' : '#f8d7da';
            return `<span style="font-family:monospace; background:${bg}; color:${color}; padding:2px 6px; border-radius:4px; margin-right:4px; font-weight:bold; font-size:12px;" title="Estado: ${e.estado}">${e.codigo_ejemplar}</span>`;
        }).join('');

        return `
            <tr>
                <td><strong>${b.area_cod || '-'}</strong></td>
                <td><strong>${b.libro_num || '-'}</strong></td>
                <td>${codigosList || 'Sin códigos'}</td>
                <td><strong>${b.titulo}</strong></td>
                <td>${b.autor || '-'}</td>
                <td>${b.editorial || '-'}</td>
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

    if (lista.length > limit) {
        rowsHtml += `<tr><td colspan="10" style="text-align:center; background:#fff3cd; color:#856404; font-weight:bold;">Mostrando primeros ${limit} libros de ${lista.length} registrados (Usa el buscador arriba para filtrar en tiempo real).</td></tr>`;
    }

    tbody.innerHTML = rowsHtml;
}

function filtrarCatalogo() {
    const q = document.getElementById('cat-search-input').value.toLowerCase().trim();
    const filtrados = catalogoLibrosCache.filter(b => 
        (b.area_cod && b.area_cod.toLowerCase().includes(q)) ||
        (b.libro_num && b.libro_num.toLowerCase().includes(q)) ||
        (b.titulo && b.titulo.toLowerCase().includes(q)) ||
        (b.autor && b.autor.toLowerCase().includes(q))
    );
    renderTablaCatalogo(filtrados);
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

// ---------- 4. COLA DE RESERVAS ----------

async function cargarReservas() {
    const tbody = document.getElementById('reservas-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Cargando reservas...</td></tr>';

    const res = await tursodb.query(`SELECT * FROM biblioteca_reservas ORDER BY created_at DESC`);
    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888;">No hay reservas registradas.</td></tr>';
        return;
    }

    reservasCache = res.rows;

    tbody.innerHTML = reservasCache.map(r => {
        const stBadge = r.estado === 'pendiente' 
            ? '<span class="badge badge-warning">Pendiente</span>'
            : '<span class="badge badge-secondary">Atendida / Cancelada</span>';

        return `
            <tr>
                <td><strong>${r.libro_id}</strong></td>
                <td>${r.persona_nombre}<br><small style="color:#666;">CI: ${r.persona_ci}</small></td>
                <td>${formatearFecha(r.fecha_reserva)}</td>
                <td>${stBadge}</td>
                <td>
                    ${r.estado === 'pendiente' ? `
                        <button onclick="cancelarReserva('${r.id}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">Cancelar</button>
                    ` : '-'}
                </td>
            </tr>
        `;
    }).join('');
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

    await tursodb.query(
        `INSERT INTO biblioteca_reservas (id, libro_id, persona_ci, persona_nombre, persona_tipo, estado)
         VALUES (?, ?, ?, ?, ?, 'pendiente')`,
        [Date.now().toString(), libroId, ci, nombre, tipo]
    );

    alert(`🔖 RESERVA REGISTRADA\nSe registró la reserva del libro para ${nombre}.\nEste libro no podrá ser renovado por quien lo tenga prestado en este momento.`);
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

                let cod = '';
                let num = '';
                let titulo = '';
                let autor = '';
                let editorial = '';
                let anio = null;
                let cantEjem = 1;
                let estado = 'Bueno';

                // Si encontramos cabecera explicita
                if (headerRowIndex !== -1 && colMap.titulo !== -1) {
                    cod = colMap.cod !== -1 ? String(row[colMap.cod] || '').trim() : '';
                    num = colMap.num !== -1 ? String(row[colMap.num] || '').trim() : '';
                    titulo = String(row[colMap.titulo] || '').trim();
                    autor = colMap.autor !== -1 ? String(row[colMap.autor] || '').trim() : '';
                    editorial = colMap.editorial !== -1 ? String(row[colMap.editorial] || '').trim() : '';
                    anio = colMap.anio !== -1 ? parseInt(row[colMap.anio]) || null : null;
                    cantEjem = colMap.ejem !== -1 ? parseInt(row[colMap.ejem]) || 1 : 1;
                    estado = colMap.estado !== -1 ? String(row[colMap.estado] || 'Bueno').trim() : 'Bueno';
                }

                // Si no se encontró título por cabeceras, probar el mapeo por columnas estándar (A=Estado, B=Nº, C=COD, D=Autor, E=Título, F=Año, G=Ejemplares, H=Editorial)
                if (!titulo) {
                    const candidateNum = String(row[1] || '').trim();
                    const candidateCod = String(row[2] || '').trim();
                    const candidateAutor = String(row[3] || '').trim();
                    const candidateTitulo = String(row[4] || row[3] || '').trim();
                    const candidateAnio = parseInt(row[5]) || null;
                    const candidateEjem = parseInt(row[6]) || 1;
                    const candidateEdit = String(row[7] || '').trim();
                    const candidateEstado = String(row[0] || 'Bueno').trim();

                    if (candidateNum && candidateTitulo && candidateTitulo.length > 2) {
                        num = candidateNum;
                        cod = candidateCod || '01';
                        autor = candidateAutor;
                        titulo = candidateTitulo;
                        anio = candidateAnio;
                        cantEjem = candidateEjem;
                        editorial = candidateEdit;
                        estado = candidateEstado.toUpperCase().includes('BUENO') || candidateEstado.toUpperCase().includes('ESTADO') ? 'Bueno' : candidateEstado;
                    }
                }

                // Mantener o limpiar el código de área COD
                if (cod && cod.length <= 10) currentAreaCod = cod;
                else cod = currentAreaCod;

                // Solo registrar filas con Nº y TÍTULO válidos
                if (num && titulo && titulo.length > 2 && !num.toUpperCase().includes('Nº')) {
                    if (!estado || estado === 'ESTADO') estado = 'Bueno';

                    const codigosGenerados = [];
                    for (let i = 1; i <= cantEjem; i++) {
                        codigosGenerados.push(`${cod}${num}${i}`);
                    }
                    totalEjemplaresCount += cantEjem;

                    excelParsedRows.push({
                        cod,
                        num,
                        titulo,
                        autor,
                        editorial,
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
            const codigoEjem = `${r.cod}${r.num}${i}`;
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
