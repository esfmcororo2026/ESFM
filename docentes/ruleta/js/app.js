// ========== RULETA DE PARTICIPACIÓN ==========

let currentUser = null;
let estudiantes = [];       // todos los del grupo
let pendientes = [];        // los que aún no participaron
let sesionId = null;
let girando = false;
let anguloActual = 0;

const COLORES = [
    '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7',
    '#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9',
    '#F0B27A','#82E0AA','#F1948A','#AED6F1','#A9DFBF'
];

// Cache local para selects
let cacheEstudiantes = [];
let cacheMaterias = [];

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) { window.location.href = '../../index.html'; return; }
    currentUser = user;
    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = user.nombre);
    document.querySelectorAll('.dropdown-rol').forEach(el => el.textContent = user.rol.toUpperCase());
    await tursodb.initializeData();
    await cargarTodo();
    await recuperarSesionActiva();
});

async function recuperarSesionActiva() {
    const guardado = localStorage.getItem('ruleta_sesion_activa');
    if (!guardado) return;
    try {
        const datos = JSON.parse(guardado);
        if (datos.docenteId !== String(currentUser.id)) {
            localStorage.removeItem('ruleta_sesion_activa');
            return;
        }
        // Verificar que la sesión sigue activa en BD
        const r = await tursodb.query(
            `SELECT * FROM ruleta_sesiones WHERE id = ? AND activa = 1`,
            [datos.sesionId]
        );
        if (!r.rows || r.rows.length === 0) {
            localStorage.removeItem('ruleta_sesion_activa');
            return;
        }
        // Restaurar sesión
        sesionId = datos.sesionId;
        document.getElementById('sel-especialidad').value = datos.especialidad;
        cargarAnios();
        document.getElementById('sel-anio').value = datos.anio;
        cargarMaterias();
        document.getElementById('sel-materia').value = datos.materia;
        document.getElementById('btn-iniciar').style.display = 'block';
        showToast(`Sesión activa encontrada: ${datos.especialidad} - ${datos.anio}`, 'info', 4000);
    } catch(e) {
        localStorage.removeItem('ruleta_sesion_activa');
    }
}

// Carga todo en 1 sola peticion HTTP
async function cargarTodo() {
    const [estResult, matResult] = await Promise.all([
        tursodb.query(`SELECT id, nombre, apellido_paterno, apellido_materno, codigo_unico, especialidad, anio_formacion FROM estudiantes ORDER BY especialidad, anio_formacion, apellido_paterno`),
        tursodb.query(`SELECT nombre, especialidad, anio_formacion FROM materias ORDER BY especialidad, anio_formacion, nombre`)
    ]);
    cacheEstudiantes = estResult.rows || [];
    cacheMaterias = matResult.rows || [];

    // Llenar especialidades desde cache
    const especialidades = [...new Set(cacheEstudiantes.map(e => e.especialidad))].sort();
    const sel = document.getElementById('sel-especialidad');
    especialidades.forEach(esp => sel.innerHTML += `<option value="${esp}">${esp}</option>`);
}

// ========== DROPDOWN ==========
function toggleUserDropdown(id) {
    const d = document.getElementById(id);
    if (d) d.classList.toggle('active');
}
document.addEventListener('click', function(e) {
    const d = document.getElementById('user-dropdown-ruleta');
    if (d && !d.contains(e.target)) d.classList.remove('active');
});
function cerrarSesion() {
    localStorage.removeItem('currentUser');
    window.location.href = '../../index.html';
}
function volverDocentes() {
    window.location.href = '../index.html';
}

// ========== SELECCIÓN (desde cache local) ==========
function cargarAnios() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const grupoAnio = document.getElementById('grupo-anio');
    const grupoMateria = document.getElementById('grupo-materia');
    const btnIniciar = document.getElementById('btn-iniciar');
    if (!especialidad) {
        grupoAnio.style.display = 'none';
        grupoMateria.style.display = 'none';
        btnIniciar.style.display = 'none';
        return;
    }
    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const anios = [...new Set(cacheEstudiantes
        .filter(e => e.especialidad === especialidad)
        .map(e => e.anio_formacion))]
        .sort((a,b) => orden.indexOf(a) - orden.indexOf(b));

    const sel = document.getElementById('sel-anio');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    anios.forEach(a => sel.innerHTML += `<option value="${a}">${a}</option>`);
    grupoAnio.style.display = 'block';
    grupoMateria.style.display = 'none';
    btnIniciar.style.display = 'none';
}

function cargarMaterias() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const grupoMateria = document.getElementById('grupo-materia');
    const btnIniciar = document.getElementById('btn-iniciar');
    if (!anio) { grupoMateria.style.display = 'none'; btnIniciar.style.display = 'none'; return; }

    const materias = cacheMaterias
        .filter(m => m.especialidad === especialidad && m.anio_formacion === anio)
        .map(m => m.nombre);

    const sel = document.getElementById('sel-materia');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    materias.forEach(m => sel.innerHTML += `<option value="${m}">${m}</option>`);
    grupoMateria.style.display = 'block';
    btnIniciar.style.display = 'none';
}

function mostrarBtnIniciar() {
    const materia = document.getElementById('sel-materia').value;
    document.getElementById('btn-iniciar').style.display = materia ? 'block' : 'none';
}

// ========== INICIAR RULETA ==========
async function iniciarRuleta() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const materia = document.getElementById('sel-materia').value;
    if (!especialidad || !anio || !materia) return;

    // Cargar estudiantes desde cache local
    estudiantes = cacheEstudiantes.filter(e =>
        e.especialidad === especialidad && e.anio_formacion === anio
    ).sort((a,b) => a.apellido_paterno.localeCompare(b.apellido_paterno));

    if (estudiantes.length === 0) {
        showToast('No hay estudiantes en este grupo', 'warning'); return;
    }

    // Buscar sesión activa
    const sesionResult = await tursodb.query(
        `SELECT * FROM ruleta_sesiones WHERE docente_id = ? AND especialidad = ? AND anio_formacion = ? AND materia = ? AND activa = 1 ORDER BY created_at DESC LIMIT 1`,
        [String(currentUser.id), especialidad, anio, materia]
    );

    if (sesionResult.rows && sesionResult.rows.length > 0) {
        sesionId = sesionResult.rows[0].id;
        showToast('Retomando sesión activa', 'info');
    } else {
        // Cerrar cualquier sesión activa anterior del mismo grupo (limpieza)
        await tursodb.query(
            `UPDATE ruleta_sesiones SET activa = 0 WHERE docente_id = ? AND especialidad = ? AND anio_formacion = ? AND materia = ? AND activa = 1`,
            [String(currentUser.id), especialidad, anio, materia]
        );
        // Crear nueva sesión
        sesionId = Date.now().toString() + Math.random().toString(36).substr(2,4);
        const fechaLocal = new Date();
        const fecha = `${fechaLocal.getFullYear()}-${String(fechaLocal.getMonth()+1).padStart(2,'0')}-${String(fechaLocal.getDate()).padStart(2,'0')}`;
        await tursodb.query(
            `INSERT INTO ruleta_sesiones (id, docente_id, especialidad, anio_formacion, materia, fecha_inicio, total_estudiantes, activa) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [sesionId, String(currentUser.id), especialidad, anio, materia, fecha, estudiantes.length]
        );
    }

    // Guardar sesionId en localStorage para sobrevivir recargas
    localStorage.setItem('ruleta_sesion_activa', JSON.stringify({
        sesionId, especialidad, anio, materia, docenteId: String(currentUser.id)
    }));

    // Cargar quiénes ya participaron en esta sesión
    await cargarPendientes(especialidad, anio);

    // Mostrar vista ruleta
    document.getElementById('vista-seleccion').style.display = 'none';
    document.getElementById('vista-ruleta').style.display = 'block';
    document.getElementById('ruleta-titulo').textContent = `${especialidad} - ${anio}`;
    document.getElementById('ruleta-info').textContent = `📖 ${materia}`;

    dibujarRuleta();
    await cargarReporte();
}

async function cargarPendientes(especialidad, anio) {
    const yaParticiparon = await tursodb.query(
        `SELECT estudiante_id FROM participaciones WHERE sesion_id = ?`,
        [sesionId]
    );
    const idsParticiparon = new Set((yaParticiparon.rows || []).map(r => r.estudiante_id));
    pendientes = estudiantes.filter(e => !idsParticiparon.has(e.id));
    actualizarInfo();
}

function actualizarInfo() {
    const participaron = estudiantes.length - pendientes.length;
    document.getElementById('ruleta-info').textContent =
        `👥 Pendientes: ${pendientes.length} | ✅ Participaron: ${participaron} / ${estudiantes.length}`;

    if (pendientes.length === 0) {
        document.getElementById('btn-girar').disabled = true;
        document.getElementById('btn-girar').textContent = '🎉 ¡Todos participaron!';
        showToast('¡Todos los estudiantes participaron!', 'success', 5000);
    }
}

// ========== RULETA CANVAS ==========
function dibujarRuleta(anguloOffset = 0) {
    const canvas = document.getElementById('ruleta-canvas');
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radio = cx - 10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pendientes.length === 0) {
        ctx.fillStyle = '#28a745';
        ctx.beginPath();
        ctx.arc(cx, cy, radio, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 ¡Todos!', cx, cy);
        return;
    }

    const segmento = (Math.PI * 2) / pendientes.length;

    pendientes.forEach((est, i) => {
        const inicio = anguloOffset + i * segmento;
        const fin = inicio + segmento;
        const color = COLORES[i % COLORES.length];

        // Segmento
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radio, inicio, fin);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Texto
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(inicio + segmento / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#222';
        ctx.font = `bold ${pendientes.length > 20 ? '9' : pendientes.length > 10 ? '11' : '13'}px Segoe UI`;

        const apellido = est.apellido_paterno || '';
        const nombre = est.nombre || '';
        const texto = `${apellido} ${nombre}`.substring(0, 18);
        ctx.fillText(texto, radio - 8, 4);
        ctx.restore();
    });

    // Centro
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
}

// ========== GIRAR ==========
function girarRuleta() {
    if (girando || pendientes.length === 0) return;
    girando = true;

    document.getElementById('btn-girar').disabled = true;
    document.getElementById('ganador-box').style.display = 'none';

    const vueltasExtra = 5 + Math.random() * 5; // 5-10 vueltas
    const anguloExtra = Math.PI * 2 * vueltasExtra;
    const anguloFinal = anguloActual + anguloExtra;
    const duracion = 4000;
    const inicio = performance.now();

    function animar(ahora) {
        const transcurrido = ahora - inicio;
        const progreso = Math.min(transcurrido / duracion, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progreso, 3);
        const anguloActualAnim = anguloActual + anguloExtra * ease;

        dibujarRuleta(anguloActualAnim);

        if (progreso < 1) {
            requestAnimationFrame(animar);
        } else {
            anguloActual = anguloFinal % (Math.PI * 2);
            girando = false;
            mostrarGanador();
        }
    }

    requestAnimationFrame(animar);
}

async function mostrarGanador() {
    if (pendientes.length === 0) return;

    // Calcular ganador: la flecha apunta arriba (top = angulo PI*1.5 en coordenadas canvas)
    // El canvas dibuja desde anguloActual, el segmento 0 empieza en anguloActual
    // La flecha apunta a -PI/2 (arriba), entonces buscamos que angulo del canvas corresponde a arriba
    const segmento = (Math.PI * 2) / pendientes.length;
    // Angulo que apunta arriba relativo al canvas rotado
    const anguloArriba = (Math.PI * 1.5 - anguloActual % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const indice = Math.floor(anguloArriba / segmento) % pendientes.length;
    const ganador = pendientes[indice];

    if (!ganador) {
        girando = false;
        document.getElementById('btn-girar').disabled = false;
        return;
    }

    const apellidoM = ganador.apellido_materno !== 'SIN DATO' ? ganador.apellido_materno : '';
    const nombre = `${ganador.apellido_paterno} ${apellidoM} ${ganador.nombre}`.trim();

    // Guardar participacion
    const ahora = new Date();
    const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
    const hora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
    const id = Date.now().toString() + Math.random().toString(36).substr(2,4);
    const especialidad = document.getElementById('ruleta-titulo').textContent.split(' - ')[0];
    const anio = document.getElementById('ruleta-titulo').textContent.split(' - ')[1];

    await tursodb.query(
        `INSERT INTO participaciones (id, estudiante_id, docente_id, especialidad, anio_formacion, fecha, hora, sesion_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ganador.id, String(currentUser.id), especialidad, anio, fecha, hora, sesionId]
    );

    // Quitar de pendientes y redibujar INMEDIATAMENTE
    pendientes = pendientes.filter(e => e.id !== ganador.id);
    dibujarRuleta();
    actualizarInfo();

    // Reactivar boton y estado ANTES de cualquier await
    girando = false;
    document.getElementById('btn-girar').disabled = pendientes.length === 0;

    // Mostrar celebracion inmediatamente
    mostrarCelebracion(nombre, ganador.codigo_unico);

    // Cargar reporte en segundo plano (no bloquea)
    cargarReporte();
}

function mostrarCelebracion(nombre, codigo) {
    const overlay = document.createElement('div');
    overlay.id = 'celebracion-overlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.88); z-index:999999;
        display:flex; flex-direction:column;
        align-items:center; justify-content:center;
        cursor:pointer; overflow:hidden;
        animation: fadeInOverlay 0.3s ease;
    `;

    // Confetti
    const colors = ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#FF8B94','#B4F8C8','#FBE7C6','#A0C4FF','#FFD700','#FF69B4'];
    for (let i = 0; i < 100; i++) {
        const c = document.createElement('div');
        const size = 6 + Math.random() * 14;
        const isCircle = Math.random() > 0.5;
        c.style.cssText = `
            position:absolute; width:${size}px; height:${size}px;
            background:${colors[Math.floor(Math.random()*colors.length)]};
            border-radius:${isCircle ? '50%' : '2px'};
            left:${Math.random()*100}%; top:-20px;
            animation: caerConfetti ${2+Math.random()*3}s ${Math.random()*1.5}s linear infinite;
            opacity:0.9;
        `;
        overlay.appendChild(c);
    }

    // Emojis flotantes
    const emojis = ['🎉','🌟','✨','🎊','⭐','💫','🏆','🎯'];
    for (let i = 0; i < 15; i++) {
        const e = document.createElement('div');
        e.textContent = emojis[Math.floor(Math.random()*emojis.length)];
        e.style.cssText = `
            position:absolute; font-size:${24+Math.random()*28}px;
            left:${Math.random()*90}%; top:${Math.random()*90}%;
            animation: flotarEmoji ${1.5+Math.random()*2}s ${Math.random()}s ease-in-out infinite alternate;
            pointer-events:none;
        `;
        overlay.appendChild(e);
    }

    // Caja principal
    const box = document.createElement('div');
    box.style.cssText = `
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        border: 3px solid #FFD700;
        border-radius: 24px;
        padding: 35px 40px;
        text-align: center;
        max-width: 88%;
        width: 380px;
        box-shadow: 0 0 80px rgba(255,215,0,0.6), 0 0 30px rgba(255,215,0,0.3), 0 20px 60px rgba(0,0,0,0.8);
        animation: popInGanador 0.6s cubic-bezier(0.175,0.885,0.32,1.275);
        position: relative; z-index: 2;
    `;

    box.innerHTML = `
        <div style="font-size:4.5rem; margin-bottom:8px; animation:bounceEmoji 0.5s ease infinite alternate;">🎯</div>
        <div style="color:#FFD700; font-size:0.85rem; font-weight:800; letter-spacing:4px; margin-bottom:18px; text-transform:uppercase;">¡Participante Seleccionado!</div>
        <div style="color:white; font-size:clamp(1.3rem,5vw,2rem); font-weight:900; line-height:1.3; margin-bottom:10px;
            text-shadow: 0 0 30px rgba(255,215,0,0.9), 0 2px 4px rgba(0,0,0,0.5);">${nombre}</div>
        <div style="background:rgba(255,215,0,0.15); border:1px solid rgba(255,215,0,0.4); border-radius:8px;
            color:rgba(255,255,255,0.8); font-size:1rem; padding:6px 16px; display:inline-block; margin-bottom:20px;
            font-family:monospace; letter-spacing:2px;">${codigo}</div>
        <div style="font-size:1.8rem; margin-bottom:18px; animation:bounceRow 0.4s ease infinite alternate;">🎉🏆🎉</div>
        <div style="color:rgba(255,255,255,0.35); font-size:12px;">Toca en cualquier lugar para continuar</div>
    `;

    overlay.appendChild(box);

    if (!document.getElementById('celebracion-styles')) {
        const style = document.createElement('style');
        style.id = 'celebracion-styles';
        style.textContent = `
            @keyframes fadeInOverlay { from{opacity:0} to{opacity:1} }
            @keyframes popInGanador {
                0%   { transform:scale(0.3) rotate(-15deg); opacity:0; }
                60%  { transform:scale(1.08) rotate(2deg); }
                100% { transform:scale(1) rotate(0deg); opacity:1; }
            }
            @keyframes caerConfetti {
                0%   { transform:translateY(-20px) rotate(0deg); opacity:1; }
                100% { transform:translateY(110vh) rotate(720deg); opacity:0.2; }
            }
            @keyframes flotarEmoji {
                from { transform:translateY(0) scale(1) rotate(-5deg); opacity:0.6; }
                to   { transform:translateY(-25px) scale(1.2) rotate(5deg); opacity:1; }
            }
            @keyframes bounceEmoji {
                from { transform:translateY(0) scale(1); }
                to   { transform:translateY(-12px) scale(1.15); }
            }
            @keyframes bounceRow {
                from { transform:scale(1); }
                to   { transform:scale(1.1); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());
    setTimeout(() => { if (document.getElementById('celebracion-overlay')) overlay.remove(); }, 7000);
}

// ========== HISTORIAL ==========
async function mostrarHistorial() {
    document.getElementById('vista-seleccion').style.display = 'none';
    document.getElementById('vista-historial').style.display = 'block';

    const result = await tursodb.query(`
        SELECT * FROM ruleta_sesiones
        WHERE docente_id = ?
        ORDER BY created_at DESC
    `, [String(currentUser.id)]);

    const lista = document.getElementById('historial-lista');

    if (!result.rows || result.rows.length === 0) {
        lista.innerHTML = '<div class="card"><p style="text-align:center;color:#666;">No hay sesiones registradas</p></div>';
        return;
    }

    lista.innerHTML = '';
    for (const sesion of result.rows) {
        const estado = sesion.activa == 1 ? '🟢 Activa' : '⚫ Finalizada';
        const fechaFin = sesion.fecha_fin ? sesion.fecha_fin : 'En curso';

        const card = document.createElement('div');
        card.className = 'historial-card';
        card.innerHTML = `
            <div class="historial-card-header" onclick="toggleSesion('ses-${sesion.id}', '${sesion.id}')">
                <div>
                    <strong>${sesion.especialidad} - ${sesion.anio_formacion}</strong>
                    <small>📖 ${sesion.materia || 'Sin materia'}</small>
                    <small>${sesion.fecha_inicio} → ${fechaFin} | ${estado}</small>
                    <small>Participaron: ${sesion.total_participaron || '?'} / ${sesion.total_estudiantes || '?'}</small>
                </div>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="historial-participantes" id="ses-${sesion.id}" style="display:none;"></div>
        `;
        lista.appendChild(card);
    }
}

async function toggleSesion(divId, sesionId) {
    const div = document.getElementById(divId);
    const icon = div.previousElementSibling.querySelector('.toggle-icon');

    if (div.style.display === 'block') {
        div.style.display = 'none';
        icon.textContent = '▼';
        return;
    }

    div.innerHTML = '<p style="padding:10px;color:#999;">Cargando...</p>';
    div.style.display = 'block';
    icon.textContent = '▲';

    const result = await tursodb.query(`
        SELECT p.fecha, p.hora, e.nombre, e.apellido_paterno, e.apellido_materno, e.codigo_unico
        FROM participaciones p
        JOIN estudiantes e ON p.estudiante_id = e.id
        WHERE p.sesion_id = ?
        ORDER BY p.fecha ASC, p.hora ASC
    `, [sesionId]);

    if (!result.rows || result.rows.length === 0) {
        div.innerHTML = '<p style="padding:10px;color:#999;text-align:center;">Sin participantes</p>';
        return;
    }

    div.innerHTML = result.rows.map((r, i) => {
        const apellidoM = r.apellido_materno !== 'SIN DATO' ? r.apellido_materno : '';
        const nombre = `${r.apellido_paterno} ${apellidoM} ${r.nombre}`.trim();
        return `
            <div class="participante-item">
                <span class="part-num">${i + 1}</span>
                <div class="part-info">
                    <strong>${nombre}</strong>
                    <small>${r.codigo_unico} | ${r.fecha} ${r.hora}</small>
                </div>
            </div>`;
    }).join('');
}

function cerrarHistorial() {
    document.getElementById('vista-historial').style.display = 'none';
    document.getElementById('vista-seleccion').style.display = 'block';
}

// ========== REPORTE ==========
async function cargarReporte() {
    if (!sesionId) return;
    const result = await tursodb.query(`
        SELECT p.fecha, p.hora, e.nombre, e.apellido_paterno, e.apellido_materno, e.codigo_unico
        FROM participaciones p
        JOIN estudiantes e ON p.estudiante_id = e.id
        WHERE p.sesion_id = ?
        ORDER BY p.fecha ASC, p.hora ASC
    `, [sesionId]);

    const lista = document.getElementById('reporte-lista');
    const participaron = result.rows ? result.rows.length : 0;
    document.getElementById('reporte-titulo').textContent = `📋 Participantes (${participaron}/${estudiantes.length})`;

    if (!result.rows || result.rows.length === 0) {
        lista.innerHTML = '<p style="color:#999; text-align:center; padding:15px;">Aún no hay participantes</p>';
        return;
    }

    lista.innerHTML = result.rows.map((r, i) => {
        const apellidoM = r.apellido_materno !== 'SIN DATO' ? r.apellido_materno : '';
        const nombre = `${r.apellido_paterno} ${apellidoM} ${r.nombre}`.trim();
        return `
            <div class="participante-item">
                <span class="part-num">${i + 1}</span>
                <div class="part-info">
                    <strong>${nombre}</strong>
                    <small>${r.codigo_unico} | ${r.fecha} ${r.hora}</small>
                </div>
            </div>`;
    }).join('');
}

// ========== REINICIAR ==========
async function reiniciarRuleta() {
    const participaron = estudiantes.length - pendientes.length;
    const ok = await showConfirm(
        'Reiniciar Ruleta',
        `Se guardarán los <strong>${participaron}</strong> participantes registrados y se iniciará una nueva sesión.<br><br>¿Confirmas el reinicio?`,
        'warning'
    );
    if (!ok) return;

    const ahora = new Date();
    const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
    await tursodb.query(
        `UPDATE ruleta_sesiones SET activa = 0, fecha_fin = ?, total_participaron = ? WHERE id = ?`,
        [fecha, participaron, sesionId]
    );

    showToast(`Sesión guardada con ${participaron} participantes`, 'success');

    sesionId = null;
    pendientes = [];
    anguloActual = 0;
    girando = false;
    localStorage.removeItem('ruleta_sesion_activa');

    document.getElementById('ganador-box').style.display = 'none';
    document.getElementById('vista-ruleta').style.display = 'none';
    document.getElementById('vista-seleccion').style.display = 'block';
    document.getElementById('btn-iniciar').style.display = 'none';
    document.getElementById('sel-especialidad').value = '';
    document.getElementById('sel-anio').value = '';
    document.getElementById('grupo-anio').style.display = 'none';
    document.getElementById('grupo-materia').style.display = 'none';
    document.getElementById('sel-materia').value = '';
}
