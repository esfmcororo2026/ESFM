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
}

// ========== MATERIAS ==========
async function cargarEspecialidadesMaterias() {
    const result = await tursodb.queryCached(`SELECT DISTINCT especialidad FROM estudiantes ORDER BY especialidad`, [], 'esp_all', 12 * 60 * 60 * 1000);
    const sel = document.getElementById('mat-especialidad');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    (result.rows || []).forEach(r => {
        sel.innerHTML += `<option value="${r.especialidad}">${r.especialidad}</option>`;
    });
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

    const result = await tursodb.queryCached(
        `SELECT DISTINCT anio_formacion FROM estudiantes WHERE especialidad = ? ORDER BY anio_formacion`,
        [especialidad],
        `anios_${especialidad}`,
        12 * 60 * 60 * 1000
    );
    const orden = ['PRIMERO','SEGUNDO','TERCERO','CUARTO','QUINTO'];
    const anios = (result.rows || []).sort((a,b) => orden.indexOf(a.anio_formacion) - orden.indexOf(b.anio_formacion));

    const sel = document.getElementById('mat-anio');
    sel.innerHTML = '<option value="">-- Selecciona --</option>';
    anios.forEach(r => sel.innerHTML += `<option value="${r.anio_formacion}">${r.anio_formacion}</option>`);

    grupoAnio.style.display = 'block';
}

async function cargarMaterias() {
    const especialidad = document.getElementById('mat-especialidad').value;
    const anio = document.getElementById('mat-anio').value;
    const formAgregar = document.getElementById('mat-form-agregar');
    const listaContainer = document.getElementById('mat-lista-container');
    const sinResultados = document.getElementById('mat-sin-resultados');

    if (!anio) {
        formAgregar.style.display = 'none';
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'none';
        return;
    }

    const result = await tursodb.queryCached(
        `SELECT * FROM materias WHERE especialidad = ? AND anio_formacion = ? ORDER BY nombre`,
        [especialidad, anio],
        `materias_${especialidad}_${anio}`,
        12 * 60 * 60 * 1000
    );

    formAgregar.style.display = 'block';
    const materias = result.rows || [];

    if (materias.length === 0) {
        listaContainer.style.display = 'none';
        sinResultados.style.display = 'block';
    } else {
        sinResultados.style.display = 'none';
        listaContainer.style.display = 'block';
        const lista = document.getElementById('mat-lista');
        lista.innerHTML = '';
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
