function fechaLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dia = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dia}`;
}

// ========== TOMAR ASISTENCIA - LÓGICA ==========

let currentUser = null;
let estadosEstudiantes = {};
let cambiosPendientes = {}; // { registroId: nuevoEstado }

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) { window.location.href = '../../index.html'; return; }
    currentUser = user;
    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = user.nombre);
    document.querySelectorAll('.dropdown-rol').forEach(el => el.textContent = user.rol.toUpperCase());
    await cargarEspecialidades();
    await verificarRegistroHoy();
});

// ========== DROPDOWN ==========
function toggleUserDropdown(id) {
    const d = document.getElementById(id);
    if (d) d.classList.toggle('active');
}
document.addEventListener('click', function(e) {
    const d = document.getElementById('user-dropdown-ta');
    if (d && !d.contains(e.target)) d.classList.remove('active');
});
function cerrarSesion() {
    localStorage.removeItem('currentUser');
    window.location.href = '../../index.html';
}
function volverDocentes() {
    sessionStorage.setItem('fromModule', '1');
    window.location.href = '../index.html';
}

// ========== PASO 1: SELECCIÓN ==========
async function cargarEspecialidades() {
    let result = await tursodb.queryCached(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`, [], 'esp_all', 12 * 60 * 60 * 1000);
    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache('esp_all');
        result = await tursodb.query(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`);
    }
    if (!result.rows || result.rows.length === 0) {
        result = await tursodb.query(`SELECT DISTINCT especialidad FROM materias ORDER BY especialidad`);
    }
    const sel = document.getElementById('sel-especialidad');
    sel.innerHTML = '<option value="">-- Selecciona especialidad --</option>';
    (result.rows || []).forEach(row => {
        if (row.especialidad) {
            sel.innerHTML += `<option value="${row.especialidad}">${row.especialidad}</option>`;
        }
    });
}

async function cargarAnios() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const grupoAnio = document.getElementById('grupo-anio');
    const grupoMateria = document.getElementById('grupo-materia');
    const btnCargar = document.getElementById('btn-cargar');
    const selAnio = document.getElementById('sel-anio');

    if (!especialidad) {
        grupoAnio.style.display = 'none';
        grupoMateria.style.display = 'none';
        btnCargar.style.display = 'none';
        return;
    }

    let result = await tursodb.queryCached(
        `SELECT DISTINCT anio_formacion FROM estudiantes WHERE especialidad = ? ORDER BY anio_formacion`,
        [especialidad],
        `anios_${especialidad}`,
        12 * 60 * 60 * 1000
    );

    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache(`anios_${especialidad}`);
        result = await tursodb.query(
            `SELECT DISTINCT anio_formacion FROM estudiantes WHERE especialidad = ? ORDER BY anio_formacion`,
            [especialidad]
        );
    }
    if (!result.rows || result.rows.length === 0) {
        result = await tursodb.query(
            `SELECT DISTINCT anio_formacion FROM materias WHERE especialidad = ? ORDER BY anio_formacion`,
            [especialidad]
        );
    }

    selAnio.innerHTML = '<option value="">-- Selecciona año --</option>';
    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const anios = (result.rows || []).sort((a,b) => orden.indexOf(a.anio_formacion) - orden.indexOf(b.anio_formacion));
    anios.forEach(row => {
        if (row.anio_formacion) {
            selAnio.innerHTML += `<option value="${row.anio_formacion}">${row.anio_formacion}</option>`;
        }
    });

    grupoAnio.style.display = 'block';
}

async function cargarMaterias() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const grupoMateria = document.getElementById('grupo-materia');
    const btnCargar = document.getElementById('btn-cargar');
    const selMateria = document.getElementById('sel-materia');

    if (!especialidad || !anio) {
        grupoMateria.style.display = 'none';
        btnCargar.style.display = 'none';
        return;
    }

    let result = await tursodb.queryCached(
        `SELECT * FROM materias WHERE especialidad = ? AND anio_formacion = ? ORDER BY nombre`,
        [especialidad, anio],
        `materias_${especialidad}_${anio}`,
        12 * 60 * 60 * 1000
    );

    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache(`materias_${especialidad}_${anio}`);
        result = await tursodb.query(
            `SELECT * FROM materias WHERE especialidad = ? AND anio_formacion = ? ORDER BY nombre`,
            [especialidad, anio]
        );
    }

    selMateria.innerHTML = '<option value="">-- Selecciona materia --</option>';
    (result.rows || []).forEach(m => {
        if (m.nombre) {
            selMateria.innerHTML += `<option value="${m.nombre}">${m.nombre}</option>`;
        }
    });

    grupoMateria.style.display = 'block';
    verificarBotonCargar();
}

function verificarBotonCargar() {
    const materia = document.getElementById('sel-materia').value;
    const btnCargar = document.getElementById('btn-cargar');
    if (btnCargar) {
        btnCargar.style.display = materia ? 'block' : 'none';
    }
}

// ========== PASO 2: LISTA ==========
async function cargarLista() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const materia = document.getElementById('sel-materia').value;
    if (!especialidad || !anio || !materia) { showToast('Selecciona especialidad, año y materia', 'warning'); return; }

    let result = await tursodb.queryCached(
        `SELECT * FROM estudiantes WHERE especialidad = ? AND anio_formacion = ? ORDER BY apellido_paterno, nombre`,
        [especialidad, anio],
        `estudiantes_${especialidad}_${anio}`,
        6 * 60 * 60 * 1000
    );

    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache(`estudiantes_${especialidad}_${anio}`);
        result = await tursodb.query(
            `SELECT * FROM estudiantes WHERE especialidad = ? AND anio_formacion = ? ORDER BY apellido_paterno, nombre`,
            [especialidad, anio]
        );
    }

    if (!result.rows || result.rows.length === 0) {
        showToast('No hay estudiantes en este grupo', 'warning'); return;
    }

    // Inicializar todos como PRESENTE
    estadosEstudiantes = {};
    result.rows.forEach(est => { estadosEstudiantes[est.id] = 'PRESENTE'; });

    // Ocultar registros del día al entrar a tomar lista
    document.querySelectorAll('.registros-hoy').forEach(el => el.style.display = 'none');

    // Mostrar lista
    document.getElementById('paso-seleccion').style.display = 'none';
    document.getElementById('paso-lista').style.display = 'block';

    const ahora = new Date();
    document.getElementById('lista-titulo').textContent = `${especialidad} - ${anio}`;
    document.getElementById('lista-fecha').textContent =
        `📅 ${ahora.toLocaleDateString('es-BO')} | 🕒 ${ahora.toLocaleTimeString('es-BO', {hour:'2-digit', minute:'2-digit'})} | 📖 ${materia}`;

    renderLista(result.rows);
    actualizarContadores();
}

function renderLista(estudiantes) {
    const container = document.getElementById('lista-estudiantes');
    container.innerHTML = '';
    estudiantes.forEach(est => {
        const div = document.createElement('div');
        div.className = 'estudiante-row';
        div.id = `row-${est.id}`;
        div.onclick = () => toggleEstado(est.id);
        div.innerHTML = `
            <div class="est-info">
                <strong>${est.apellido_paterno} ${est.apellido_materno !== 'SIN DATO' ? est.apellido_materno : ''} ${est.nombre}</strong>
                <small>${est.codigo_unico}</small>
            </div>
            <span class="estado-badge presente" id="badge-${est.id}">Presente</span>
        `;
        container.appendChild(div);
    });
}

function toggleEstado(estudianteId) {
    estadosEstudiantes[estudianteId] = estadosEstudiantes[estudianteId] === 'PRESENTE' ? 'AUSENTE' : 'PRESENTE';
    actualizarBadge(estudianteId);
    actualizarContadores();
}

function actualizarBadge(estudianteId) {
    const badge = document.getElementById(`badge-${estudianteId}`);
    const row = document.getElementById(`row-${estudianteId}`);
    const estado = estadosEstudiantes[estudianteId];
    if (estado === 'PRESENTE') {
        badge.textContent = 'Presente';
        badge.className = 'estado-badge presente';
        row.className = 'estudiante-row';
    } else {
        badge.textContent = 'Ausente';
        badge.className = 'estado-badge ausente';
        row.className = 'estudiante-row ausente';
    }
}

function marcarTodos(estado) {
    Object.keys(estadosEstudiantes).forEach(id => {
        estadosEstudiantes[id] = estado;
        actualizarBadge(id);
    });
    actualizarContadores();
}

function actualizarContadores() {
    const presentes = Object.values(estadosEstudiantes).filter(e => e === 'PRESENTE').length;
    const ausentes = Object.values(estadosEstudiantes).filter(e => e === 'AUSENTE').length;
    document.getElementById('cnt-presente').textContent = presentes;
    document.getElementById('cnt-ausente').textContent = ausentes;
}

// ========== GUARDAR ==========
async function guardarAsistencia() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const materia = document.getElementById('sel-materia').value;
    const ahora = new Date();
    const fecha = fechaLocal(ahora);
    const hora = ahora.toLocaleTimeString('es-BO', {hour:'2-digit', minute:'2-digit', hour12:false});

    const total = Object.keys(estadosEstudiantes).length;
    const presentes = Object.values(estadosEstudiantes).filter(e => e === 'PRESENTE').length;

    // Verificar si ya existe un registro de este grupo+materia hoy
    const existe = await tursodb.query(`
        SELECT COUNT(*) as total FROM asistencia_estudiantes
        WHERE docente_id = ? AND especialidad = ? AND anio_formacion = ? AND materia = ? AND fecha = ?
    `, [String(currentUser.id), especialidad, anio, materia, fecha]);

    if (existe.rows && parseInt(existe.rows[0].total) > 0) {
        const confirmar = await showConfirm('Registro duplicado', `Ya existe un registro de <strong>${materia}</strong> para este grupo hoy.<br>¿Deseas guardar un nuevo registro de todas formas?`, 'warning');
        if (!confirmar) return;
    } else {
        const confirmar = await showConfirm('Guardar Asistencia', `<strong>${especialidad} - ${anio}</strong><br>Materia: ${materia}<br><br>Presentes: ${presentes} | Ausentes: ${total - presentes}`, 'success');
        if (!confirmar) return;
    }

    // Deshabilitar boton para evitar doble guardado
    const btnGuardar = document.querySelector('.btn-guardar');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = '🔄 Guardando...'; }

    try {
        const queries = Object.entries(estadosEstudiantes).map(([estId, est]) => ({
            sql: "INSERT INTO asistencia_estudiantes (id, estudiante_id, docente_id, especialidad, anio_formacion, materia, estado, fecha, hora_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params: [Date.now().toString() + Math.random().toString(36).substr(2,5), estId, String(currentUser.id), especialidad, anio, materia, est, fecha, hora]
        }));
        await tursodb.batchQuery(queries);
        showToast(`Asistencia guardada: ${presentes} presentes | ${total - presentes} ausentes`, "success");
        document.getElementById('paso-lista').style.display = 'none';
        document.getElementById('paso-seleccion').style.display = 'block';
        document.getElementById('sel-especialidad').value = '';
        document.getElementById('sel-anio').value = '';
        document.getElementById('grupo-anio').style.display = 'none';
        document.getElementById('grupo-materia').style.display = 'none';
        document.getElementById('btn-cargar').style.display = 'none';
        document.getElementById('sel-materia').value = '';
        document.querySelectorAll('.registros-hoy').forEach(el => el.remove());
        await verificarRegistroHoy();
    } catch (error) {
        showToast('Error guardando: ' + error.message, 'error');
        // Reactivar boton si hay error
        if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = '💾 Guardar Asistencia'; }
    }
}

// ========== VERIFICAR REGISTRO HOY ==========
async function verificarRegistroHoy() {
    const fecha = fechaLocal();
    const result = await tursodb.query(`
        SELECT DISTINCT especialidad, anio_formacion, materia, hora_registro
        FROM asistencia_estudiantes
        WHERE docente_id = ? AND fecha = ?
        ORDER BY hora_registro DESC
    `, [String(currentUser.id), fecha]);

    if (result.rows && result.rows.length > 0) {
        // Hay registros hoy - mostrar opción de actualizar
        mostrarRegistrosHoy(result.rows, fecha);
    }
}

function mostrarRegistrosHoy(registros, fecha) {
    const seleccion = document.getElementById('paso-seleccion');
    let html = `<div class="registros-hoy"><h3>📌 Registros de hoy (${fecha})</h3>`;
    registros.forEach(r => {
        html += `
            <div class="registro-item" onclick="cargarActualizacion('${r.especialidad}', '${r.anio_formacion}', '${fecha}')">
                <span>🎓 ${r.especialidad} - ${r.anio_formacion} | 📖 ${r.materia || ''}</span>
                <span class="hora-reg">🕒 ${r.hora_registro} <span class="btn-edit">Actualizar →</span></span>
            </div>`;
    });
    html += '</div>';
    seleccion.insertAdjacentHTML('afterend', html);
}

// ========== PASO 3: ACTUALIZAR ==========
async function cargarActualizacion(especialidad, anio, fecha) {
    cambiosPendientes = {}; // Limpiar cambios al cargar
    const result = await tursodb.query(`
        SELECT ae.*, e.nombre, e.apellido_paterno, e.apellido_materno, e.codigo_unico
        FROM asistencia_estudiantes ae
        JOIN estudiantes e ON ae.estudiante_id = e.id
        WHERE ae.especialidad = ? AND ae.anio_formacion = ? AND ae.fecha = ? AND ae.docente_id = ?
        ORDER BY e.apellido_paterno, e.nombre
    `, [especialidad, anio, fecha, String(currentUser.id)]);

    if (!result.rows || result.rows.length === 0) return;

    document.getElementById('paso-seleccion').style.display = 'none';
    document.getElementById('paso-lista').style.display = 'none';
    document.querySelectorAll('.registros-hoy').forEach(el => el.style.display = 'none');
    document.getElementById('paso-actualizar').style.display = 'block';

    document.getElementById('act-titulo').textContent = `${especialidad} - ${anio}`;
    document.getElementById('act-fecha').textContent = `📅 ${fecha} | Actualizando ausentes`;

    renderActualizacion(result.rows);
    actualizarContadoresAct(result.rows);
}

function renderActualizacion(registros) {
    const container = document.getElementById('lista-actualizar');
    container.innerHTML = '';
    registros.forEach(reg => {
        const div = document.createElement('div');
        div.className = `estudiante-row ${reg.estado !== 'PRESENTE' ? 'ausente' : ''}`;
        div.id = `act-row-${reg.id}`;

        const nombre = `${reg.apellido_paterno} ${reg.apellido_materno !== 'SIN DATO' ? reg.apellido_materno : ''} ${reg.nombre}`;

        if (reg.estado === 'PRESENTE') {
            div.innerHTML = `
                <div class="est-info">
                    <strong>${nombre}</strong>
                    <small>${reg.codigo_unico}</small>
                </div>
                <span class="estado-badge presente">Presente</span>
            `;
        } else {
            div.innerHTML = `
                <div class="est-info">
                    <strong>${nombre}</strong>
                    <small>${reg.codigo_unico}</small>
                </div>
                <div class="estados-update">
                    <button onclick="marcarCambio('${reg.id}', 'AUSENTE', this)" 
                        class="btn-estado ${reg.estado === 'AUSENTE' ? 'activo ausente-btn' : ''}">Ausente</button>
                    <button onclick="marcarCambio('${reg.id}', 'RETRASO', this)" 
                        class="btn-estado ${reg.estado === 'RETRASO' ? 'activo retraso-btn' : ''}">Retraso</button>
                    <button onclick="marcarCambio('${reg.id}', 'LICENCIA', this)" 
                        class="btn-estado ${reg.estado === 'LICENCIA' ? 'activo licencia-btn' : ''}">Licencia</button>
                </div>
            `;
        }
        container.appendChild(div);
    });
}

// Marcar cambio en memoria (sin guardar en BD)
function marcarCambio(registroId, nuevoEstado, btn) {
    cambiosPendientes[registroId] = nuevoEstado;

    // Actualizar visual: desactivar todos los botones del grupo y activar el seleccionado
    const grupo = btn.parentElement;
    grupo.querySelectorAll('.btn-estado').forEach(b => {
        b.classList.remove('activo', 'ausente-btn', 'retraso-btn', 'licencia-btn');
    });
    btn.classList.add('activo');
    if (nuevoEstado === 'AUSENTE')  btn.classList.add('ausente-btn');
    if (nuevoEstado === 'RETRASO')  btn.classList.add('retraso-btn');
    if (nuevoEstado === 'LICENCIA') btn.classList.add('licencia-btn');

    // Indicar que hay cambios pendientes
    const total = Object.keys(cambiosPendientes).length;
    document.querySelector('#paso-actualizar .botones-accion .btn-primary').textContent =
        `💾 Guardar (${total} cambio${total !== 1 ? 's' : ''})`;
}

// Guardar todos los cambios pendientes en BD
async function guardarCambios() {
    if (Object.keys(cambiosPendientes).length === 0) {
        volverSeleccion();
        return;
    }
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-BO', {hour:'2-digit', minute:'2-digit', hour12:false});
    const fechaAct = fechaLocal(ahora);

    for (const [registroId, nuevoEstado] of Object.entries(cambiosPendientes)) {
        await tursodb.query(`
            UPDATE asistencia_estudiantes
            SET estado = ?, hora_actualizacion = ?, fecha_actualizacion = ?
            WHERE id = ?
        `, [nuevoEstado, hora, fechaAct, registroId]);
    }

    cambiosPendientes = {};
    showToast('Cambios guardados correctamente', 'success');
    volverSeleccion();
}

function actualizarContadoresAct(registros) {
    document.getElementById('act-cnt-presente').textContent = registros.filter(r => r.estado === 'PRESENTE').length;
    document.getElementById('act-cnt-retraso').textContent = registros.filter(r => r.estado === 'RETRASO').length;
    document.getElementById('act-cnt-licencia').textContent = registros.filter(r => r.estado === 'LICENCIA').length;
    document.getElementById('act-cnt-ausente').textContent = registros.filter(r => r.estado === 'AUSENTE').length;
}

function cancelarLista() {
    document.getElementById('paso-lista').style.display = 'none';
    document.getElementById('paso-seleccion').style.display = 'block';
    document.querySelectorAll('.registros-hoy').forEach(el => el.style.display = 'block');
    estadosEstudiantes = {};
}

function volverSeleccion() {
    cambiosPendientes = {};
    document.getElementById('paso-actualizar').style.display = 'none';
    document.getElementById('paso-seleccion').style.display = 'block';
    document.querySelectorAll('.registros-hoy').forEach(el => el.style.display = 'block');
}
