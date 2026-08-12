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
        btnFlash.style.display = 'none';
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
        ).then(() => {
            if (btnFlash) btnFlash.style.display = 'inline-block';
        }).catch(() => {
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
        btnFlash.style.display = 'none';
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
        alert('La cámara no está activa.');
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
