// ========== CONFIGURACIÓN ==========

let currentUser = null;

window.addEventListener('DOMContentLoaded', async function () {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) { window.location.href = '../../index.html'; return; }
    currentUser = user;
    document.querySelectorAll('.user-display-name').forEach(el => el.textContent = user.nombre);
    document.querySelectorAll('.dropdown-rol').forEach(el => el.textContent = user.rol.toUpperCase());
    await cargarEspecialidadesMaterias();
});

// ========== DROPDOWN ==========
function toggleUserDropdown(id) {
    const d = document.getElementById(id);
    if (d) d.classList.toggle('active');
}
document.addEventListener('click', function(e) {
    const d = document.getElementById('user-dropdown-cfg');
    if (d && !d.contains(e.target)) d.classList.remove('active');
});
function cerrarSesion() {
    localStorage.removeItem('currentUser');
    window.location.href = '../../index.html';
}
function volverDocentes() {
    window.location.href = '../index.html';
}

// ========== NAVEGACIÓN ==========
function mostrarVista(id) {
    document.querySelectorAll('.container > div').forEach(el => el.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    document.getElementById('btn-volver').onclick = id === 'vista-menu' ? volverDocentes : () => mostrarVista('vista-menu');
    if (id === 'vista-materias') {
        cargarEspecialidadesMaterias();
    }
    if (id === 'vista-estudiantes') {
        cargarEspecialidadesEstudiantes();
    }
}

// ========== MATERIAS ==========
async function cargarEspecialidadesMaterias() {
    let result = await tursodb.queryCached(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`, [], 'esp_all', 12 * 60 * 60 * 1000);
    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache('esp_all');
        result = await tursodb.query(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`);
    }

    const especialidadesSet = new Set();
    (result.rows || []).forEach(r => {
        if (r.especialidad && r.especialidad.trim()) especialidadesSet.add(r.especialidad.trim());
    });

    const resultMat = await tursodb.query(`SELECT DISTINCT especialidad FROM materias ORDER BY especialidad`);
    (resultMat.rows || []).forEach(r => {
        if (r.especialidad && r.especialidad.trim()) especialidadesSet.add(r.especialidad.trim());
    });

    const defaultEspecialidades = [
        'AGROPECUARIA PRODUCTIVA',
        'EDUCACIÓN AGROPECUARIA',
        'EDUCACIÓN FÍSICA Y DEPORTES',
        'EDUCACIÓN PRIMARIA',
        'MATEMÁTICA'
    ];
    if (especialidadesSet.size === 0) {
        defaultEspecialidades.forEach(esp => especialidadesSet.add(esp));
    }

    const sel = document.getElementById('mat-especialidad');
    if (!sel) return;
    const valActual = sel.value;
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    Array.from(especialidadesSet).sort().forEach(esp => {
        sel.innerHTML += `<option value="${esp}">${esp}</option>`;
    });
    if (valActual && especialidadesSet.has(valActual)) {
        sel.value = valActual;
    }
}

async function cargarAniosMaterias() {
    const especialidad = document.getElementById('mat-especialidad').value;
    const grupoAnio = document.getElementById('mat-grupo-anio');
    const formAgregar = document.getElementById('mat-form-agregar');
    const listaContainer = document.getElementById('mat-lista-container');
    const sinResultados = document.getElementById('mat-sin-resultados');

    formAgregar.style.display = 'none';
    listaContainer.style.display = 'none';
    sinResultados.style.display = 'none';

    if (!especialidad) { grupoAnio.style.display = 'none'; return; }

    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const sel = document.getElementById('mat-anio');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    orden.forEach(a => sel.innerHTML += `<option value="${a}">${a}</option>`);

    grupoAnio.style.display = 'block';
}

async function cargarMaterias() {
    const especialidad = document.getElementById('mat-especialidad').value;
    const anio = document.getElementById('mat-anio').value;
    const formAgregar = document.getElementById('mat-form-agregar');
    const listaContainer = document.getElementById('mat-lista-container');
    const sinResultados = document.getElementById('mat-sin-resultados');

    if (!anio || !especialidad) {
        formAgregar.style.display = 'none';
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'none';
        return;
    }

    let result = await tursodb.queryCached(
        `SELECT * FROM materias WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND (UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) OR (anio_formacion = '4' AND ? = 'CUARTO')) ORDER BY nombre`,
        [especialidad, anio, anio],
        `materias_${especialidad.trim()}_${anio.trim()}`,
        12 * 60 * 60 * 1000
    );

    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache(`materias_${especialidad.trim()}_${anio.trim()}`);
        result = await tursodb.query(
            `SELECT * FROM materias WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND (UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) OR (anio_formacion = '4' AND ? = 'CUARTO')) ORDER BY nombre`,
            [especialidad, anio, anio]
        );
    }

    formAgregar.style.display = 'block';
    const materias = result.rows || [];

    if (materias.length === 0) {
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'block';
    } else {
        sinResultados.style.display = 'none';
        listaContainer.style.display = 'block';
        renderMaterias(materias);
    }
}

async function renderMaterias(materias) {
    const container = document.getElementById('mat-lista');
    const especialidad = document.getElementById('mat-especialidad').value;
    const anio = document.getElementById('mat-anio').value;
    container.innerHTML = '';

    for (const m of materias) {
        const registros = await tursodb.query(
            `SELECT COUNT(*) as total FROM asistencia_estudiantes WHERE materia = ? AND especialidad = ? AND anio_formacion = ? AND docente_id = ?`,
            [m.nombre, especialidad, anio, String(currentUser.id)]
        );
        const total = parseInt(registros.rows?.[0]?.total || 0);
        const tieneRegistros = total > 0;

        const div = document.createElement('div');
        div.className = 'materia-item';
        div.id = `mat-${m.id}`;
        div.innerHTML = `
            <div>
                <span class="materia-nombre">📖 ${m.nombre}</span>
                ${tieneRegistros ? `<small style="color:#28a745; display:block; margin-top:3px;">✅ ${total} registro${total !== 1 ? 's' : ''} de asistencia</small>` : '<small style="color:#999; display:block; margin-top:3px;">Sin registros</small>'}
            </div>
            <button onclick="eliminarMateria('${m.id}', '${m.nombre.replace(/'/g, "\\'")}')"
                class="btn-danger btn-sm"
                ${tieneRegistros ? 'disabled title="Tiene registros de asistencia"' : ''}>
                ✕ Eliminar
            </button>
        `;
        container.appendChild(div);
    }
}

async function agregarMateria() {
    const nombre = document.getElementById('mat-nombre').value.trim().toUpperCase();
    const especialidad = document.getElementById('mat-especialidad').value;
    const anio = document.getElementById('mat-anio').value;

    if (!nombre) { showToast('Ingresa el nombre de la materia', 'warning'); return; }

    const existe = await tursodb.query(
        `SELECT id FROM materias WHERE nombre = ? AND especialidad = ? AND anio_formacion = ?`,
        [nombre, especialidad, anio]
    );
    if (existe.rows && existe.rows.length > 0) {
        showToast('Ya existe una materia con ese nombre en este grupo', 'warning'); return;
    }

    const id = Date.now().toString() + Math.random().toString(36).substr(2,4);
    await tursodb.query(
        `INSERT INTO materias (id, nombre, especialidad, anio_formacion) VALUES (?, ?, ?, ?)`,
        [id, nombre, especialidad, anio]
    );

    tursodb.clearCache('materias_');
    document.getElementById('mat-nombre').value = '';
    await cargarMaterias();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('mat-nombre') === document.activeElement) {
        agregarMateria();
    }
});

async function eliminarMateria(id, nombre) {
    const especialidad = document.getElementById('mat-especialidad').value;
    const anio = document.getElementById('mat-anio').value;

    const registros = await tursodb.query(
        `SELECT COUNT(*) as total FROM asistencia_estudiantes WHERE materia = ? AND especialidad = ? AND anio_formacion = ? AND docente_id = ?`,
        [nombre, especialidad, anio, String(currentUser.id)]
    );

    const total = parseInt(registros.rows?.[0]?.total || 0);

    if (total > 0) {
        showToast(`No se puede eliminar "${nombre}". Tiene ${total} registro(s) de asistencia asociados.`, 'error');
        return;
    }

    if (!(await showConfirm('Eliminar Materia', `¿Eliminar la materia <strong>${nombre}</strong>?`, 'error'))) return;
    await tursodb.query(`DELETE FROM materias WHERE id = ?`, [id]);
    tursodb.clearCache('materias_');
    await cargarMaterias();
}

// ========== ESTUDIANTES ==========
async function cargarEspecialidadesEstudiantes() {
    let result = await tursodb.queryCached(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`, [], 'esp_all', 12 * 60 * 60 * 1000);
    if (!result.rows || result.rows.length === 0) {
        tursodb.clearCache('esp_all');
        result = await tursodb.query(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`);
    }

    const especialidadesSet = new Set();
    (result.rows || []).forEach(r => {
        if (r.especialidad && r.especialidad.trim()) especialidadesSet.add(r.especialidad.trim());
    });

    // Agregar especialidades de asistencia_estudiantes (grupos ya con historial)
    const resultAsis = await tursodb.query(`SELECT DISTINCT especialidad FROM asistencia_estudiantes ORDER BY especialidad`);
    (resultAsis.rows || []).forEach(r => {
        if (r.especialidad && r.especialidad.trim()) especialidadesSet.add(r.especialidad.trim());
    });

    const defaultEspecialidades = [
        'AGROPECUARIA PRODUCTIVA',
        'EDUCACIÓN AGROPECUARIA',
        'EDUCACIÓN FÍSICA Y DEPORTES',
        'EDUCACIÓN INICIAL EN FAMILIA COMUNITARIA',
        'EDUCACIÓN PRIMARIA COMUNITARIA VOCACIONAL',
        'ARTES PLÁSTICAS Y VISUALES',
        'COMUNICACIÓN Y LENGUAJES: LENGUA EXTRANJERA (INGLÉS)',
        'MATEMÁTICA'
    ];
    if (especialidadesSet.size === 0) {
        defaultEspecialidades.forEach(esp => especialidadesSet.add(esp));
    }

    const sel = document.getElementById('est-especialidad');
    if (!sel) return;
    const valActual = sel.value;
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    Array.from(especialidadesSet).sort().forEach(esp => {
        sel.innerHTML += `<option value="${esp}">${esp}</option>`;
    });
    if (valActual && especialidadesSet.has(valActual)) sel.value = valActual;
}

function cargarAniosEstudiantes() {
    const especialidad = document.getElementById('est-especialidad').value;
    const grupoAnio = document.getElementById('est-grupo-anio');
    const formAgregar = document.getElementById('est-form-agregar');
    const listaContainer = document.getElementById('est-lista-container');
    const sinResultados = document.getElementById('est-sin-resultados');

    formAgregar.style.display = 'none';
    listaContainer.style.display = 'none';
    sinResultados.style.display = 'none';

    if (!especialidad) { grupoAnio.style.display = 'none'; return; }

    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const sel = document.getElementById('est-anio');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    orden.forEach(a => sel.innerHTML += `<option value="${a}">${a}</option>`);
    grupoAnio.style.display = 'block';
}

async function cargarEstudiantes() {
    const especialidad = document.getElementById('est-especialidad').value;
    const anio = document.getElementById('est-anio').value;
    const formAgregar = document.getElementById('est-form-agregar');
    const listaContainer = document.getElementById('est-lista-container');
    const sinResultados = document.getElementById('est-sin-resultados');

    if (!anio || !especialidad) {
        formAgregar.style.display = 'none';
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'none';
        return;
    }

    formAgregar.style.display = 'block';

    // Limpiar campos del form
    ['est-apellido-paterno','est-apellido-materno','est-nombre','est-ci'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    let result = await tursodb.query(
        `SELECT * FROM estudiantes WHERE UPPER(TRIM(especialidad)) = UPPER(TRIM(?)) AND UPPER(TRIM(anio_formacion)) = UPPER(TRIM(?)) ORDER BY apellido_paterno, nombre`,
        [especialidad, anio]
    );

    const estudiantes = result.rows || [];
    const titulo = document.getElementById('est-lista-titulo');
    titulo.textContent = `🎓 ${especialidad} · ${anio} (${estudiantes.length} estudiante${estudiantes.length !== 1 ? 's' : ''})`;

    if (estudiantes.length === 0) {
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'block';
    } else {
        sinResultados.style.display = 'none';
        listaContainer.style.display = 'block';
        renderEstudiantes(estudiantes);
    }

    tursodb.clearCache('esp_all');
    tursodb.clearCache(`estudiantes_${especialidad.trim()}_${anio.trim()}`);
}

function renderEstudiantes(estudiantes) {
    const container = document.getElementById('est-lista');
    container.innerHTML = '';
    estudiantes.forEach((e, idx) => {
        const apellidos = [e.apellido_paterno, e.apellido_materno && e.apellido_materno !== 'SIN DATO' ? e.apellido_materno : ''].filter(Boolean).join(' ');
        const nombre = `${apellidos} ${e.nombre}`;
        const div = document.createElement('div');
        div.className = 'materia-item';
        div.id = `est-row-${e.id}`;
        div.innerHTML = `
            <div>
                <span class="materia-nombre">🎓 ${idx + 1}. ${nombre}</span>
                <small style="color:#888; display:block; margin-top:2px;">CI: ${e.dni || e.codigo_unico}</small>
            </div>
            <button onclick="eliminarEstudiante('${e.id}', '${nombre.replace(/'/g, "\\'")}')"
                class="btn-danger btn-sm">
                ✕ Eliminar
            </button>
        `;
        container.appendChild(div);
    });
}

async function agregarEstudiante() {
    const especialidad = document.getElementById('est-especialidad').value;
    const anio = document.getElementById('est-anio').value;
    const apPat = document.getElementById('est-apellido-paterno').value.trim().toUpperCase();
    const apMat = document.getElementById('est-apellido-materno').value.trim().toUpperCase() || 'SIN DATO';
    const nombre = document.getElementById('est-nombre').value.trim().toUpperCase();
    const ci = document.getElementById('est-ci').value.trim();

    if (!apPat || !nombre || !ci) {
        showToast('Apellido paterno, nombre y CI son obligatorios', 'warning');
        return;
    }

    const existe = await tursodb.query(
        `SELECT id FROM estudiantes WHERE dni = ? OR codigo_unico = ?`, [ci, ci]
    );
    if (existe.rows && existe.rows.length > 0) {
        showToast('Ya existe un estudiante con ese CI/Código', 'warning');
        return;
    }

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    await tursodb.query(
        `INSERT INTO estudiantes (id, codigo_unico, dni, nombre, apellido_paterno, apellido_materno, especialidad, anio_formacion, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, ci, ci, nombre, apPat, apMat, especialidad, anio, 'estudiante123']
    );

    ['est-apellido-paterno','est-apellido-materno','est-nombre','est-ci'].forEach(eid => {
        const el = document.getElementById(eid);
        if (el) el.value = '';
    });
    showToast(`✅ ${apPat} ${nombre} agregado correctamente`, 'success');
    tursodb.clearCache(`estudiantes_${especialidad.trim()}_${anio.trim()}`);
    tursodb.clearCache('esp_all');
    await cargarEstudiantes();
}

async function eliminarEstudiante(id, nombre) {
    const especialidad = document.getElementById('est-especialidad').value;
    const anio = document.getElementById('est-anio').value;

    const registros = await tursodb.query(
        `SELECT COUNT(*) as total FROM asistencia_estudiantes WHERE estudiante_id = ?`, [id]
    );
    const total = parseInt(registros.rows?.[0]?.total || 0);

    if (total > 0) {
        showToast(`No se puede eliminar "${nombre}". Tiene ${total} registro(s) de asistencia.`, 'error');
        return;
    }

    if (!(await showConfirm('Eliminar Estudiante', `¿Eliminar a <strong>${nombre}</strong>?`, 'error'))) return;
    await tursodb.query(`DELETE FROM estudiantes WHERE id = ?`, [id]);
    tursodb.clearCache(`estudiantes_${especialidad.trim()}_${anio.trim()}`);
    tursodb.clearCache('esp_all');
    await cargarEstudiantes();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('est-ci') === document.activeElement) {
        agregarEstudiante();
    }
});
