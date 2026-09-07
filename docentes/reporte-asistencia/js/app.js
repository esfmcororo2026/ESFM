function fechaLocal(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dia = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dia}`;
}

// ========== REPORTE DE ASISTENCIA ==========

let currentUser = null;

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) { window.location.href = '../../index.html'; return; }
    currentUser = user;
    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = user.nombre);
    document.querySelectorAll('.dropdown-rol').forEach(el => el.textContent = user.rol.toUpperCase());
    await cargarEspecialidades();
});

// ========== DROPDOWN ==========
function toggleUserDropdown(id) {
    const d = document.getElementById(id);
    if (d) d.classList.toggle('active');
}
document.addEventListener('click', function(e) {
    const d = document.getElementById('user-dropdown-rep');
    if (d && !d.contains(e.target)) d.classList.remove('active');
});
function cerrarSesion() {
    localStorage.removeItem('currentUser');
    window.location.href = '../../index.html';
}
function volverDocentes() {
    window.location.href = '../index.html';
}

// ========== SELECCIÓN ==========
async function cargarEspecialidades() {
    const result = await tursodb.queryCached(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`, [], 'esp_all', 12 * 60 * 60 * 1000);
    const sel = document.getElementById('sel-especialidad');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    (result.rows || []).forEach(r => {
        sel.innerHTML += `<option value="${r.especialidad}">${r.especialidad}</option>`;
    });
}

async function cargarAnios() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const grupoAnio = document.getElementById('grupo-anio');
    const grupoMateria = document.getElementById('grupo-materia');
    const btnGenerar = document.getElementById('btn-generar');

    grupoMateria.style.display = 'none';
    btnGenerar.style.display = 'none';
    document.getElementById('reporte-container').style.display = 'none';

    if (!especialidad) { grupoAnio.style.display = 'none'; return; }

    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const sel = document.getElementById('sel-anio');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    orden.forEach(a => sel.innerHTML += `<option value="${a}">${a}</option>`);
    grupoAnio.style.display = 'block';
}

async function cargarMaterias() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const grupoMateria = document.getElementById('grupo-materia');
    const btnGenerar = document.getElementById('btn-generar');

    btnGenerar.style.display = 'none';
    document.getElementById('reporte-container').style.display = 'none';

    if (!anio || !especialidad) { grupoMateria.style.display = 'none'; return; }

    let result = await tursodb.queryCached(
        `SELECT nombre FROM materias WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND (UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) OR (anio_formacion = '4' AND ? = 'CUARTO')) ORDER BY nombre`,
        [especialidad, anio, anio],
        `materias_nombres_${especialidad.trim()}_${anio.trim()}`,
        12 * 60 * 60 * 1000
    );

    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache(`materias_nombres_${especialidad.trim()}_${anio.trim()}`);
        result = await tursodb.query(
            `SELECT nombre FROM materias WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND (UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) OR (anio_formacion = '4' AND ? = 'CUARTO')) ORDER BY nombre`,
            [especialidad, anio, anio]
        );
    }

    const sel = document.getElementById('sel-materia');
    sel.innerHTML = '<option value="">-- Selecciona materia --</option>';
    (result.rows || []).forEach(m => {
        if (m.nombre) {
            sel.innerHTML += `<option value="${m.nombre}">${m.nombre}</option>`;
        }
    });

    grupoMateria.style.display = 'block';
}

function mostrarBotonGenerar() {
    const materia = document.getElementById('sel-materia').value;
    document.getElementById('btn-generar').style.display = materia ? 'block' : 'none';
    document.getElementById('reporte-container').style.display = 'none';
}

// ========== GENERAR REPORTE ==========
async function generarReporte() {
    const especialidad = document.getElementById('sel-especialidad').value;
    const anio = document.getElementById('sel-anio').value;
    const materia = document.getElementById('sel-materia').value;
    if (!especialidad || !anio || !materia) return;

    // 1. Estudiantes del grupo
    const estResult = await tursodb.query(
        `SELECT id, nombre, apellido_paterno, apellido_materno, codigo_unico
         FROM estudiantes WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND (UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) OR (anio_formacion = '4' AND ? = 'CUARTO'))
         ORDER BY apellido_paterno, nombre`,
        [especialidad, anio, anio]
    );
    if (!estResult.rows || estResult.rows.length === 0) {
        alert('No hay estudiantes en este grupo'); return;
    }

    // 2. Clases registradas (filtradas por materia si aplica)
    let clasesQuery, clasesParams;
    if (materia === 'TODAS') {
        clasesQuery = `SELECT DISTINCT fecha, hora_registro, materia
                       FROM asistencia_estudiantes
                       WHERE especialidad = ? AND anio_formacion = ? AND docente_id = ?
                       ORDER BY fecha ASC, hora_registro ASC`;
        clasesParams = [especialidad, anio, String(currentUser.id)];
    } else {
        clasesQuery = `SELECT DISTINCT fecha, hora_registro, materia
                       FROM asistencia_estudiantes
                       WHERE especialidad = ? AND anio_formacion = ? AND materia = ? AND docente_id = ?
                       ORDER BY fecha ASC, hora_registro ASC`;
        clasesParams = [especialidad, anio, materia, String(currentUser.id)];
    }
    const clasesResult = await tursodb.query(clasesQuery, clasesParams);
    const clases = clasesResult.rows || [];

    if (clases.length === 0) {
        alert('No hay registros de asistencia para este grupo' + (materia !== 'TODAS' ? ` en ${materia}` : '')); return;
    }

    // 3. Registros de asistencia
    let asistQuery, asistParams;
    if (materia === 'TODAS') {
        asistQuery = `SELECT estudiante_id, fecha, hora_registro, materia, estado FROM asistencia_estudiantes WHERE especialidad = ? AND anio_formacion = ? AND docente_id = ?`;
        asistParams = [especialidad, anio, String(currentUser.id)];
    } else {
        asistQuery = `SELECT estudiante_id, fecha, hora_registro, materia, estado FROM asistencia_estudiantes WHERE especialidad = ? AND anio_formacion = ? AND materia = ? AND docente_id = ?`;
        asistParams = [especialidad, anio, materia, String(currentUser.id)];
    }
    const asistResult = await tursodb.query(asistQuery, asistParams);
    const registros = asistResult.rows || [];

    // Mapa: { estudiante_id: { 'fecha_hora_materia': estado } }
    const mapaAsist = {};
    registros.forEach(r => {
        if (!mapaAsist[r.estudiante_id]) mapaAsist[r.estudiante_id] = {};
        mapaAsist[r.estudiante_id][`${r.fecha}_${r.hora_registro}`] = r.estado;
    });

    // 4. Agrupar clases por mes
    const meses = {};
    clases.forEach(c => {
        const [anioF, mes] = c.fecha.split('-');
        const key = `${anioF}-${mes}`;
        if (!meses[key]) meses[key] = [];
        meses[key].push(c);
    });

    // 5. Encabezado del reporte
    const ahora = new Date();
    const fechaReporte = ahora.toLocaleDateString('es-BO', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
    document.getElementById('rep-especialidad').textContent = especialidad;
    document.getElementById('rep-anio').textContent = anio;
    document.getElementById('rep-materia').textContent = materia === 'TODAS' ? 'Todas las materias' : materia;
    document.getElementById('rep-usuario').textContent = currentUser.nombre;
    document.getElementById('rep-fecha').textContent = fechaReporte;
    document.getElementById('rep-total-clases').textContent = clases.length;

    // 6. Cabecera de tabla
    const thead = document.getElementById('tabla-head');
    const tbody = document.getElementById('tabla-body');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const mesesNombres = {
        '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
        '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
        '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre'
    };

    // Fila 1: meses
    let fila1 = `<tr><th rowspan="3" class="th-nro">Nro</th><th rowspan="3" class="th-nombre">Nombre Completo</th>`;
    Object.keys(meses).forEach(mesKey => {
        const [, mes] = mesKey.split('-');
        fila1 += `<th colspan="${meses[mesKey].length}" class="th-mes">${mesesNombres[mes]}</th>`;
    });
    fila1 += `<th rowspan="3" class="th-total">Total</th><th rowspan="3" class="th-pct">%</th></tr>`;

    // Fila 2: fechas
    let fila2 = `<tr>`;
    clases.forEach(c => {
        const [, mes, dia] = c.fecha.split('-');
        fila2 += `<th class="th-fecha">${dia}/${mes}</th>`;
    });
    fila2 += `</tr>`;

    // Fila 3: materia (solo si es TODAS)
    let fila3 = '';
    if (materia === 'TODAS') {
        fila3 = `<tr>`;
        clases.forEach(c => {
            const mat = c.materia || '-';
            const abrev = mat.length > 6 ? mat.substring(0,6) + '.' : mat;
            fila3 += `<th class="th-materia" title="${mat}">${abrev}</th>`;
        });
        fila3 += `</tr>`;
    }

    thead.innerHTML = fila1 + fila2 + fila3;

    // 7. Filas de estudiantes
    estResult.rows.forEach((est, idx) => {
        const apellidoM = est.apellido_materno !== 'SIN DATO' ? est.apellido_materno : '';
        const nombre = `${est.apellido_paterno} ${apellidoM} ${est.nombre}`.trim();
        let asistencias = 0;
        let celdas = '';

        clases.forEach(c => {
            const key = `${c.fecha}_${c.hora_registro}`;
            const estado = mapaAsist[est.id]?.[key] || null;
            if (estado === 'PRESENTE') {
                asistencias += 1;
                celdas += `<td class="est-presente">P</td>`;
            } else if (estado === 'RETRASO') {
                asistencias += 0.6;
                celdas += `<td class="est-retraso">R</td>`;
            } else if (estado === 'LICENCIA') {
                asistencias += 1;
                celdas += `<td class="est-licencia">L</td>`;
            } else if (estado === 'AUSENTE') {
                celdas += `<td class="est-ausente">A</td>`;
            } else {
                celdas += `<td class="est-sin">-</td>`;
            }
        });

        const porcentaje = clases.length > 0 ? Math.round((asistencias / clases.length) * 100) : 0;
        const pctClass = porcentaje >= 80 ? 'pct-bueno' : porcentaje >= 60 ? 'pct-regular' : 'pct-malo';

        tbody.innerHTML += `
            <tr>
                <td class="td-nro">${idx + 1}</td>
                <td class="td-nombre">${nombre}</td>
                ${celdas}
                <td class="td-total">${asistencias}</td>
                <td class="td-pct ${pctClass}">${porcentaje}%</td>
            </tr>
        `;
    });

    document.getElementById('reporte-container').style.display = 'block';
    document.getElementById('reporte-container').scrollIntoView({behavior:'smooth'});
}
