// ========== PORTAL AUTÓNOMO Y ENCAPSULADO DE USUARIOS DE BIBLIOTECA ==========

let currentUser = null;
let userCartItems = [];
const PORTAL_SESSION_KEY = 'esfm_portal_user';

// ---------- 0. SEGURIDAD: NAVEGACIÓN BLOQUEADA DENTRO DEL PORTAL ----------

// Al cargar la página, verificar si hay sesión previa en esta pestaña
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = sessionStorage.getItem(PORTAL_SESSION_KEY);
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            mostrarPanelUsuario();
        } catch (e) {
            sessionStorage.removeItem(PORTAL_SESSION_KEY);
        }
    }

    // Trampa de historial: empujamos 2 entradas falsas para que el botón
    // Atrás navegue dentro de la misma página y no la abandone.
    history.pushState({ portal: true }, '', window.location.href);
    history.pushState({ portal: true }, '', window.location.href);
});

// Interceptar el botón Atrás del navegador
window.addEventListener('popstate', (e) => {
    if (currentUser) {
        // Si el usuario está autenticado, reempujar el estado para que NO salga
        history.pushState({ portal: true }, '', window.location.href);
    } else {
        // Si no está autenticado (está en la pantalla de CI), permitir salir
        // pero volver a poner al menos 1 entrada de historial
        history.pushState({ portal: true }, '', window.location.href);
    }
});

// Bloquear la navegación si el usuario intenta irse mientras está logueado
window.addEventListener('beforeunload', (e) => {
    if (currentUser) {
        e.preventDefault();
        e.returnValue = '¿Seguro que deseas salir? Cierra la sesión correctamente con el botón de salida.';
    }
});

// Helper pad2
function pad2(n) {
    const s = String(n || '');
    return s.length < 2 ? s.padStart(2, '0') : s;
}

// Helper escapeHtml
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// Helper para parsear fechas evitando desfases de zona horaria en YYYY-MM-DD
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

// Helper formatearFecha
function formatearFecha(fechaStr) {
    if (!fechaStr) return '-';
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

// Helper formatearFechaHora (DD/MM/YYYY HH:mm)
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

// Helper calcularFechaDevolucion: suma N horas hábiles (Lunes a Viernes)
function calcularFechaDevolucion(fechaInicio = new Date(), duracionInput = 48) {
    let fecha = new Date(parseFecha(fechaInicio).getTime());
    let horasHabiles = parseInt(duracionInput) || 48;

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
        }
        if (dia === 6) {
            fecha.setTime(fecha.getTime() + 48 * 60 * 60 * 1000);
        }
    }
    return fecha.toISOString();
}

// ---------- 1. AUTENTICACIÓN RÁPIDA POR CI (SIN CONTRASEÑA DE ADMIN) ----------

async function ingresarAlPortal() {
    const ciInput = document.getElementById('user-ci-input');
    const errorEl = document.getElementById('auth-error-msg');
    const ci = ciInput.value.trim();

    if (!ci) {
        errorEl.textContent = '⚠️ Por favor ingresa tu Número de C.I. o Código Único.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';

    try {
        // 1. Buscar en estudiantes
        const estRes = await tursodb.query(`SELECT * FROM estudiantes WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
        if (estRes.rows && estRes.rows.length > 0) {
            const est = estRes.rows[0];
            const nombre = `${est.nombre || ''} ${est.apellido_paterno || ''} ${est.apellido_materno || ''}`.trim();
            currentUser = {
                ci: est.dni || est.codigo_unico || ci,
                nombre: nombre || 'Estudiante',
                tipo: 'estudiante',
                detalle: `🎓 ${est.especialidad || 'General'} | Año ${est.anio_formacion || '1'}`
            };
        } else {
            // 2. Buscar en administrativos
            const admRes = await tursodb.query(`SELECT * FROM administrativos WHERE dni = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
            if (admRes.rows && admRes.rows.length > 0) {
                const adm = admRes.rows[0];
                const nombre = `${adm.nombre || ''} ${adm.apellido_paterno || ''} ${adm.apellido_materno || ''}`.trim();
                currentUser = {
                    ci: adm.dni || adm.codigo_unico || ci,
                    nombre: nombre || 'Personal',
                    tipo: 'personal',
                    detalle: `👔 ${adm.personal || 'Administrativo'} | ${adm.cargo || '-'}`
                };
            } else {
                // 3. Buscar en usuarios
                const usrRes = await tursodb.query(`SELECT * FROM usuarios WHERE ci = ? OR codigo_unico = ? LIMIT 1`, [ci, ci]);
                if (usrRes.rows && usrRes.rows.length > 0) {
                    const u = usrRes.rows[0];
                    currentUser = {
                        ci: u.ci || ci,
                        nombre: u.nombre || 'Usuario',
                        tipo: u.rol || 'usuario',
                        detalle: `👤 ${String(u.rol || 'USUARIO').toUpperCase()}`
                    };
                }
            }
        }

        if (!currentUser) {
            errorEl.textContent = '❌ C.I. o Código Único no encontrado. Revisa el número e intenta nuevamente.';
            errorEl.style.display = 'block';
            return;
        }

        // Guardar sesión en sessionStorage (se borra al cerrar pestaña)
        sessionStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(currentUser));

        // Mostrar pantalla encapsulada del usuario
        mostrarPanelUsuario();

    } catch (err) {
        console.error('Error al ingresar al portal:', err);
        errorEl.textContent = '❌ Error al consultar la base de datos. Inténtalo nuevamente.';
        errorEl.style.display = 'block';
    }
}

function mostrarPanelUsuario() {
    document.getElementById('section-user-auth').style.display = 'none';
    document.getElementById('section-user-portal').style.display = 'block';
    document.getElementById('portal-header-right').style.display = 'block';

    // Actualizar banner de perfil
    document.getElementById('portal-user-name').textContent = currentUser.nombre;
    document.getElementById('portal-user-detail').textContent = `C.I.: ${currentUser.ci} | ${currentUser.detalle}`;
    
    const badgeEl = document.getElementById('portal-user-badge');
    badgeEl.textContent = currentUser.tipo.toUpperCase();
    badgeEl.className = currentUser.tipo === 'estudiante' ? 'badge badge-primary' : 'badge badge-info';

    // Cargar préstamos por defecto
    switchPortalTab('prestamos');
}

function cerrarSesionUsuario() {
    if (!confirm('¿Estás seguro de que deseas cerrar tu sesión?')) return;

    // Limpiar sesión
    sessionStorage.removeItem(PORTAL_SESSION_KEY);
    currentUser = null;
    userCartItems = [];

    // Ocultar el aviso beforeunload temporalmente para el cierre de sesión normal
    // (no aplica porque solo navegamos dentro de la misma página)
    document.getElementById('user-ci-input').value = '';
    document.getElementById('auth-error-msg').style.display = 'none';
    document.getElementById('section-user-auth').style.display = 'block';
    document.getElementById('section-user-portal').style.display = 'none';
    document.getElementById('portal-header-right').style.display = 'none';
}

// ---------- 2. NAVEGACIÓN POR PESTAÑAS EN EL PORTAL DE USUARIO ----------

function switchPortalTab(tabName) {
    const tabs = ['prestamos', 'reservas', 'catalogo'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`portal-tab-${t}`);
        if (btn) btn.className = `portal-tab-btn ${t === tabName ? 'active' : ''}`;
        if (content) content.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'prestamos') cargarMisPrestamos();
    if (tabName === 'reservas') {
        buscarLibrosPortal();
        cargarMisReservas();
    }
    if (tabName === 'catalogo') cargarCatalogoPortal();
}

// ---------- 3. VISTA DE MIS PRÉSTAMOS E HISTORIAL ----------

async function cargarMisPrestamos() {
    if (!currentUser) return;
    const tbody = document.getElementById('user-loans-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">Cargando mis préstamos...</td></tr>';

    const res = await tursodb.query(
        `SELECT * FROM biblioteca_prestamos WHERE persona_ci = ? ORDER BY created_at DESC`,
        [currentUser.ci]
    );

    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:30px;">No tienes préstamos registrados en tu historial.</td></tr>';
        return;
    }

    const ahoraIso = new Date().toISOString();
    let rowsHtml = '';

    for (const p of res.rows) {
        const detRes = await tursodb.query(
            `SELECT * FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`,
            [p.id]
        );
        const detalles = detRes.rows || [];

        const librosChipsHtml = detalles.map(d => {
            const isDevuelto = d.estado_item === 'devuelto';
            const titleOnly = `${d.libro_titulo}${isDevuelto ? ' (DEVUELTO)' : ''}`;
            return `<span class="book-code-chip ${isDevuelto ? 'devuelto' : ''}" data-tooltip="${escapeHtml(titleOnly)}" title="${escapeHtml(titleOnly)}">${d.libro_codigo}${isDevuelto ? ' ✓' : ''}</span>`;
        }).join(' ');

        let estadoBadge = '';
        if (p.estado === 'devuelto') {
            estadoBadge = '<span class="badge badge-success">Devuelto</span>';
        } else if (p.fecha_devolucion_prevista < ahoraIso) {
            estadoBadge = '<span class="badge badge-danger">⚠️ Vencido</span>';
        } else {
            estadoBadge = '<span class="badge badge-warning">En Préstamo</span>';
        }

        const esActivo = p.estado === 'activo';

        rowsHtml += `
            <tr>
                <td>${formatearFechaHora(p.fecha_prestamo)}</td>
                <td>${librosChipsHtml || 'Sin detalles'}</td>
                <td><strong>${formatearFechaHora(p.fecha_devolucion_prevista)}</strong></td>
                <td>${estadoBadge}</td>
            </tr>
        `;
    }

    tbody.innerHTML = rowsHtml;
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
                await tursodb.query(
                    `UPDATE biblioteca_proyectos_ejemplares SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'`,
                    [r.ejemplar_id]
                );
            }
        }
    } catch (e) {
        console.error('Error al limpiar reservas expiradas:', e);
    }
}

// ---------- 4. BUSCADOR Y CARRITO DE SOLICITUD DE PRÉSTAMO ----------

async function buscarLibrosPortal() {
    await verificarYLimpiarReservasExpiradas();
    const rawQ = (document.getElementById('user-search-book-input')?.value || '').trim();
    const resultsEl = document.getElementById('user-search-book-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<p style="color:#666; font-size:13px; text-align:center; padding:15px;">Buscando libros y proyectos...</p>';

    const cleanQ = rawQ.replace(/['"]/g, '');

    // 1. Libros
    let querySql = `
        SELECT e.id as ejem_id, e.codigo_ejemplar, e.ejemplar_num, e.estado as ejem_estado,
               l.id as libro_id, l.titulo, l.autor, l.editorial, l.area_cod, l.libro_num, 'libro' as tipo_item 
        FROM biblioteca_ejemplares e 
        JOIN biblioteca_libros l ON e.libro_id = l.id 
    `;

    let params = [];
    if (cleanQ) {
        querySql += ` WHERE e.codigo_ejemplar LIKE ? OR l.titulo LIKE ? OR l.autor LIKE ? OR l.area_cod LIKE ? LIMIT 20`;
        params = [`%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`];
    } else {
        querySql += ` ORDER BY CAST(l.area_cod AS INTEGER) ASC, CAST(l.libro_num AS INTEGER) ASC LIMIT 20`;
    }

    const ejemRes = await tursodb.query(querySql, params);
    let rowsLibros = ejemRes.rows || [];

    // 2. Proyectos
    let proyQuerySql = `
        SELECT pe.id as ejem_id, pe.codigo_ejemplar, pe.ejemplar_num, pe.estado as ejem_estado,
               p.id as libro_id, p.titulo, p.autores as autor, 'PROYECTO DE GRADO' as editorial, p.cod_esp as area_cod, p.proyecto_num as libro_num, 'proyecto' as tipo_item 
        FROM biblioteca_proyectos_ejemplares pe 
        JOIN biblioteca_proyectos p ON pe.proyecto_id = p.id 
    `;
    let proyParams = [];
    if (cleanQ) {
        proyQuerySql += ` WHERE pe.codigo_ejemplar LIKE ? OR p.titulo LIKE ? OR p.autores LIKE ? OR p.especialidad LIKE ? LIMIT 20`;
        proyParams = [`%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`];
    } else {
        proyQuerySql += ` ORDER BY p.gestion DESC, CAST(p.cod_esp AS INTEGER) ASC LIMIT 20`;
    }

    const proyRes = await tursodb.query(proyQuerySql, proyParams);
    const proyRows = proyRes.rows || [];
    let rowsProyectos = proyRes.rows || [];
    let rows = [...rowsLibros, ...rowsProyectos];

    portalSearchResultsMap = {};

    if (rows.length === 0) {
        resultsEl.innerHTML = '<p style="color:#888; font-size:13px; font-style:italic; text-align:center; padding:15px;">No se encontraron libros ni proyectos con esa búsqueda.</p>';
        return;
    }

    let miReservasPendientesEjemIds = new Set();
    let miReservasPendientesLibroIds = new Set();
    if (currentUser && currentUser.ci) {
        const rCheck = await tursodb.query(
            `SELECT ejemplar_id, libro_id FROM biblioteca_reservas WHERE persona_ci = ? AND estado = 'pendiente'`,
            [currentUser.ci]
        );
        if (rCheck.rows) {
            rCheck.rows.forEach(r => {
                if (r.ejemplar_id) miReservasPendientesEjemIds.add(r.ejemplar_id);
                if (r.libro_id) miReservasPendientesLibroIds.add(r.libro_id);
            });
        }
    }

    resultsEl.innerHTML = rows.map(item => {
        portalSearchResultsMap[item.ejem_id] = item;

        const yaReservadoPorMi = miReservasPendientesEjemIds.has(item.ejem_id) || miReservasPendientesLibroIds.has(item.libro_id);
        const estaDisponible = item.ejem_estado === 'disponible';
        const estaPrestado = item.ejem_estado === 'prestado';
        const estaReservado = item.ejem_estado === 'reservado';
        const badgeTipo = item.tipo_item === 'proyecto' 
            ? `<span class="badge badge-info" style="font-size:10px; margin-left:4px;">📂 PROYECTO</span>` 
            : `<span class="badge badge-secondary" style="font-size:10px; margin-left:4px;">📖 LIBRO</span>`;

        let accionesHtml = '';

        if (yaReservadoPorMi) {
            accionesHtml = `<span class="badge badge-warning" style="padding:6px 12px; font-size:12px;">✅ Reservado por ti</span>`;
        } else if (estaDisponible) {
            accionesHtml = `
                <button onclick="solicitarReservaPorId('${item.ejem_id}', true)" 
                        class="btn-info" style="padding:7px 14px; font-size:13px; font-weight:bold;">
                    🔖 Reservar (12h)
                </button>
            `;
        } else if (estaPrestado) {
            accionesHtml = `
                <span class="badge badge-danger" style="margin-right:8px;">PRESTADO</span>
                <button onclick="solicitarReservaPorId('${item.ejem_id}', false)" 
                        class="btn-info" style="padding:7px 14px; font-size:13px; font-weight:bold;">
                    🔖 Reservar (En cola)
                </button>
            `;
        } else if (estaReservado) {
            accionesHtml = `<span class="badge badge-secondary" style="padding:6px 12px;">RESERVADO</span>`;
        }

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; background:#fff;">
                <div style="font-size:13px; flex:1; padding-right:12px;">
                    <strong style="color:#0d6efd;">[${item.codigo_ejemplar}]</strong> <strong>${safeEscapePortal(item.titulo)}</strong> ${badgeTipo}<br>
                    <small style="color:#666;">Autor(es): ${safeEscapePortal(item.autor || 'N/A')} | Ejemplar #${item.ejemplar_num}</small>
                </div>
                <div>
                    ${accionesHtml}
                </div>
            </div>
        `;
    }).join('');
}

let portalSearchResultsMap = {};

function safeEscapePortal(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function solicitarReservaPorId(ejemId, esDisponible) {
    const item = portalSearchResultsMap[ejemId];
    if (!item) return;
    await solicitarReservaConExpiracion(item.libro_id, item.ejem_id, item.titulo, item.codigo_ejemplar, esDisponible);
}

async function solicitarReservaConExpiracion(libroId, ejemId, titulo, codigoEjemplar, esDisponible) {
    if (!currentUser) return;

    // Verificar si ya se tiene una reserva activa para este ítem
    const existRes = await tursodb.query(
        `SELECT * FROM biblioteca_reservas WHERE persona_ci = ? AND (ejemplar_id = ? OR libro_id = ?) AND estado = 'pendiente'`,
        [currentUser.ci, ejemId, libroId]
    );
    if (existRes.rows && existRes.rows.length > 0) {
        alert(`⚠️ YA TIENES UNA RESERVA ACTIVA\nYa solicitaste la reserva para [${codigoEjemplar}]. Consulta tu bloque de 'Mis Reservas Activas'.`);
        return;
    }

    let mensajeConfirm = `¿Deseas solicitar una reserva del ejemplar [${codigoEjemplar}] de "${titulo}"?`;
    if (esDisponible) {
        mensajeConfirm += `\n\n📌 NOTA: Este ejemplar está actualmente disponible. Al reservarlo quedará apartado EXCLUSIVAMENTE para ti durante 12 HORAS. Si no lo recoges en ese lapso, la reserva se cancelará automáticamente.`;
    } else {
        mensajeConfirm += `\n\n📌 NOTA: Este ejemplar está actualmente prestado. Al reservarlo, el usuario actual no podrá renovar su préstamo y el libro te será asignado por 12 horas al momento de su devolución.`;
    }

    if (!confirm(mensajeConfirm)) return;

    const reservaId = Date.now().toString();
    const fechaReserva = new Date().toISOString();
    let fechaExpiracion = null;

    if (esDisponible) {
        // Expiración en 12 horas exactas
        fechaExpiracion = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    }

    await tursodb.query(
        `INSERT INTO biblioteca_reservas (id, libro_id, ejemplar_id, libro_titulo, libro_codigo, persona_ci, persona_nombre, persona_tipo, estado, fecha_reserva, fecha_expiracion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [reservaId, libroId, ejemId, titulo, codigoEjemplar, currentUser.ci, currentUser.nombre, currentUser.tipo, fechaReserva, fechaExpiracion]
    );

    if (esDisponible) {
        // Cambiar estado del ejemplar a 'reservado' en libros y proyectos
        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'reservado' WHERE id = ?`, [ejemId]);
        await tursodb.query(`UPDATE biblioteca_proyectos_ejemplares SET estado = 'reservado' WHERE id = ?`, [ejemId]);
        alert(`✅ RESERVA REGISTRADA POR 12 HORAS\nHas apartado el ejemplar [${codigoEjemplar}]. Tienes 12 horas para recogerlo en la biblioteca.`);
    } else {
        alert(`✅ RESERVA EN COLA REGISTRADA\nHas reservado el ejemplar [${codigoEjemplar}]. El usuario actual no podrá renovar su préstamo y el ejemplar te será asignado por 12 horas al momento de su devolución.`);
    }

    switchPortalTab('reservas');
}

function agregarAlCarritoUsuario(ejemId, libroId, codigo, titulo) {
    if (userCartItems.some(i => i.ejemId === ejemId)) return;
    userCartItems.push({ ejemId, libroId, codigo, titulo });
    actualizarVistaCarritoUsuario();
    buscarLibrosPortal();
}

function removerDelCarritoUsuario(ejemId) {
    userCartItems = userCartItems.filter(i => i.ejemId !== ejemId);
    actualizarVistaCarritoUsuario();
    buscarLibrosPortal();
}

function actualizarVistaCarritoUsuario() {
    const listEl = document.getElementById('user-cart-items-list');
    const countEl = document.getElementById('user-cart-count');
    const deadlineEl = document.getElementById('user-cart-deadline-info');

    if (countEl) countEl.textContent = userCartItems.length;

    const fechaPrevista = calcularFechaDevolucion(new Date(), 48);
    if (deadlineEl) {
        deadlineEl.textContent = `Devolución estimada: ${formatearFechaHora(fechaPrevista)} (2 días hábiles – 48h)`;
    }

    if (!listEl) return;

    if (userCartItems.length === 0) {
        listEl.innerHTML = '<p style="color:#888; font-style:italic; text-align:center; padding-top:40px;">No has seleccionado libros todavía.</p>';
        return;
    }

    listEl.innerHTML = userCartItems.map((item, index) => `
        <div class="cart-item">
            <div style="font-size:13px;">
                <strong>${index + 1}. [${item.codigo}]</strong> ${item.titulo}
            </div>
            <button onclick="removerDelCarritoUsuario('${item.ejemId}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">🗑️</button>
        </div>
    `).join('');
}

async function confirmarSolicitudPrestamo() {
    if (!currentUser) return;
    if (userCartItems.length === 0) {
        alert('⚠️ Selecciona al menos un libro antes de confirmar la solicitud.');
        return;
    }

    const fechaHoy = new Date().toISOString();
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), 48);
    const prestamoId = Date.now().toString();

    // 1. Insertar Cabecera de Préstamo
    await tursodb.query(
        `INSERT INTO biblioteca_prestamos (id, persona_ci, persona_nombre, persona_tipo, fecha_prestamo, fecha_devolucion_prevista, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'activo')`,
        [prestamoId, currentUser.ci, currentUser.nombre, currentUser.tipo, fechaHoy, fechaDevolucionPrevista]
    );

    // 2. Insertar Detalle de Libros y Marcar Ejemplar como 'prestado'
    for (const item of userCartItems) {
        const detalleId = `${prestamoId}-${item.ejemId}`;
        await tursodb.query(
            `INSERT INTO biblioteca_prestamo_detalles (id, prestamo_id, libro_id, ejemplar_id, libro_codigo, libro_titulo, estado_item)
             VALUES (?, ?, ?, ?, ?, ?, 'prestado')`,
            [detalleId, prestamoId, item.libroId, item.ejemId, item.codigo, item.titulo]
        );

        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'prestado' WHERE id = ?`, [item.ejemId]);

        const libRes = await tursodb.query(`SELECT cantidad_disponible FROM biblioteca_libros WHERE id = ?`, [item.libroId]);
        if (libRes.rows && libRes.rows.length > 0) {
            const currentDisp = libRes.rows[0].cantidad_disponible || 0;
            await tursodb.query(`UPDATE biblioteca_libros SET cantidad_disponible = ? WHERE id = ?`, [Math.max(0, currentDisp - 1), item.libroId]);
        }
    }

    alert(`✅ SOLICITUD REGISTRADA EXITOSAMENTE\nSe asignaron ${userCartItems.length} libro(s) a tu cuenta.\nLímite de devolución: ${formatearFechaHora(fechaDevolucionPrevista)} (48h hábiles)`);

    userCartItems = [];
    actualizarVistaCarritoUsuario();
    switchPortalTab('prestamos');
}

// ---------- 5. GESTIÓN Y SOLICITUD DE RESERVAS ----------

let allUserReservations = [];

async function cargarMisReservas() {
    if (!currentUser) return;
    await verificarYLimpiarReservasExpiradas();
    
    const tbodyActive = document.getElementById('user-reservations-active-tbody');
    const tbodyHistory = document.getElementById('user-reservations-history-tbody');
    const activeBadge = document.getElementById('active-res-count');

    if (tbodyActive) tbodyActive.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">Cargando...</td></tr>';
    if (tbodyHistory) tbodyHistory.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Cargando...</td></tr>';

    const res = await tursodb.query(
        `SELECT r.*, 
                l.titulo as libro_titulo_join, 
                l.area_cod, l.libro_num,
                e.codigo_ejemplar as ejem_codigo,
                p.titulo as proy_titulo_join,
                pe.codigo_ejemplar as proy_ejem_codigo
         FROM biblioteca_reservas r
         LEFT JOIN biblioteca_libros l ON r.libro_id = l.id
         LEFT JOIN biblioteca_ejemplares e ON r.ejemplar_id = e.id
         LEFT JOIN biblioteca_proyectos p ON r.libro_id = p.id
         LEFT JOIN biblioteca_proyectos_ejemplares pe ON r.ejemplar_id = pe.id
         WHERE r.persona_ci = ?
         ORDER BY r.created_at DESC`,
        [currentUser.ci]
    );

    allUserReservations = res.rows || [];

    // Reservas activas/pendientes
    const activeRows = allUserReservations.filter(r => r.estado === 'pendiente');

    if (activeBadge) {
        activeBadge.textContent = `${activeRows.length} activa${activeRows.length === 1 ? '' : 's'}`;
    }

    if (tbodyActive) {
        if (activeRows.length === 0) {
            tbodyActive.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:20px; font-style:italic;">No tienes reservas activas.</td></tr>';
        } else {
            tbodyActive.innerHTML = activeRows.map(r => {
                let estadoBadgeHtml = '';
                if (r.fecha_expiracion) {
                    const msRestantes = new Date(r.fecha_expiracion).getTime() - Date.now();
                    if (msRestantes > 0) {
                        const hrs = Math.floor(msRestantes / (1000 * 60 * 60));
                        const mins = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
                        estadoBadgeHtml = `<span class="badge badge-warning">RESERVADO (12h)</span><br><small style="color:#d97706; font-weight:bold;">⏱️ Expira: ${formatearFechaHora(r.fecha_expiracion)} (${hrs}h ${mins}m)</small>`;
                    } else {
                        estadoBadgeHtml = `<span class="badge badge-danger">EXPIRADA</span><br><small style="color:#dc2626;">Expiró el: ${formatearFechaHora(r.fecha_expiracion)}</small>`;
                    }
                } else {
                    estadoBadgeHtml = `<span class="badge badge-info">EN COLA DE ESPERA</span><br><small style="color:#64748b;">(Se asignará al devolver)</small>`;
                }

                const tituloMostrar = r.libro_titulo || r.libro_titulo_join || r.proy_titulo_join || 'Sin título';
                const codigoMostrar = r.libro_codigo || r.ejem_codigo || r.proy_ejem_codigo || (r.area_cod ? `${pad2(r.area_cod)}${pad2(r.libro_num || '')}` : '—');

                return `
                    <tr>
                        <td style="font-size:12px;">${formatearFechaHora(r.fecha_reserva)}</td>
                        <td><strong style="color:#0d6efd;">[${codigoMostrar}]</strong><br><span style="font-size:12px;">${safeEscapePortal(tituloMostrar)}</span></td>
                        <td>${estadoBadgeHtml}</td>
                        <td>
                            <button onclick="cancelarReservaUsuario('${r.id}')" class="btn-danger" style="padding:4px 8px; font-size:11px;">Cancelar</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    renderHistorialReservasPortal();
}

function filtrarHistorialReservasPortal() {
    renderHistorialReservasPortal();
}

function renderHistorialReservasPortal() {
    const tbodyHistory = document.getElementById('user-reservations-history-tbody');
    if (!tbodyHistory) return;

    const filterVal = document.getElementById('user-res-history-filter')?.value || 'todos';

    // El historial SOLO contiene reservas finalizadas/históricas (NO pendientes)
    let historyList = allUserReservations.filter(r => r.estado !== 'pendiente');

    if (filterVal !== 'todos') {
        historyList = historyList.filter(r => r.estado === filterVal);
    }

    if (historyList.length === 0) {
        tbodyHistory.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding:25px; font-style:italic;">No hay reservas finalizadas en este historial.</td></tr>';
        return;
    }

    tbodyHistory.innerHTML = historyList.map(r => {
        let estadoBadgeHtml = '';
        let detalleText = '-';

        if (r.estado === 'completada') {
            estadoBadgeHtml = '<span class="badge badge-success">COMPLETADA</span>';
            detalleText = 'Préstamo realizado exitosamente';
        } else if (r.estado === 'expirada') {
            estadoBadgeHtml = '<span class="badge badge-danger">EXPIRADA</span>';
            detalleText = r.fecha_expiracion ? `Expiró el ${formatearFechaHora(r.fecha_expiracion)}` : 'Expiró el plazo de 12h';
        } else if (r.estado === 'cancelada') {
            estadoBadgeHtml = '<span class="badge badge-secondary">CANCELADA</span>';
            detalleText = 'Solicitud cancelada por el usuario o administrador';
        } else {
            estadoBadgeHtml = `<span class="badge badge-secondary">${safeEscapePortal(r.estado.toUpperCase())}</span>`;
            detalleText = '-';
        }

        const tituloMostrar = r.libro_titulo || r.libro_titulo_join || r.proy_titulo_join || 'Sin título';
        const codigoMostrar = r.libro_codigo || r.ejem_codigo || r.proy_ejem_codigo || (r.area_cod ? `${pad2(r.area_cod)}${pad2(r.libro_num || '')}` : '—');
        
        const esProyecto = codigoMostrar.length === 8 || Boolean(r.proy_titulo_join);
        const tipoBadge = esProyecto
            ? `<span class="badge badge-info" style="font-size:10px;">📂 Proyecto</span>`
            : `<span class="badge badge-secondary" style="font-size:10px;">📖 Libro</span>`;

        return `
            <tr>
                <td style="font-size:12px;">${formatearFechaHora(r.fecha_reserva)}</td>
                <td><strong style="color:#0d6efd;">[${codigoMostrar}]</strong><br><span style="font-size:13px;">${safeEscapePortal(tituloMostrar)}</span></td>
                <td>${tipoBadge}</td>
                <td>${estadoBadgeHtml}</td>
                <td style="font-size:12px; color:#64748b;">${detalleText}</td>
            </tr>
        `;
    }).join('');
}

async function cancelarReservaUsuario(reservaId) {
    if (!confirm('¿Cancelar esta solicitud de reserva?')) return;
    const res = await tursodb.query(`SELECT ejemplar_id FROM biblioteca_reservas WHERE id = ?`, [reservaId]);
    await tursodb.query(`UPDATE biblioteca_reservas SET estado = 'cancelada' WHERE id = ?`, [reservaId]);
    if (res.rows && res.rows[0] && res.rows[0].ejemplar_id) {
        const ejemId = res.rows[0].ejemplar_id;
        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'`, [ejemId]);
        await tursodb.query(`UPDATE biblioteca_proyectos_ejemplares SET estado = 'disponible' WHERE id = ? AND estado = 'reservado'`, [ejemId]);
    }
    await cargarMisReservas();
}

// ---------- 6. CATÁLOGO PÚBLICO DE LA BIBLIOTECA ----------

let _catalogoLibros = [];      // cache de libros
let _catalogoEjemplares = {};  // mapa libro_id -> [ejemplares]

async function cargarCatalogoPortal() {
    const tbody = document.getElementById('catalogo-portal-tbody');
    const paginEl = document.getElementById('catalogo-portal-pagination');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">Cargando catálogo...</td></tr>';

    // Solo cargar desde la BD la primera vez (cachear para filtros en cliente)
    if (_catalogoLibros.length === 0) {
        const libRes = await tursodb.query(
            `SELECT id, area_cod, libro_num, titulo, autor, cantidad_total, cantidad_disponible
             FROM biblioteca_libros
             ORDER BY CAST(area_cod AS INTEGER) ASC, CAST(libro_num AS INTEGER) ASC`
        );
        _catalogoLibros = libRes.rows || [];

        const ejemRes = await tursodb.query(
            `SELECT libro_id, codigo_ejemplar, estado FROM biblioteca_ejemplares ORDER BY ejemplar_num ASC`
        );
        _catalogoEjemplares = {};
        (ejemRes.rows || []).forEach(e => {
            if (!_catalogoEjemplares[e.libro_id]) _catalogoEjemplares[e.libro_id] = [];
            _catalogoEjemplares[e.libro_id].push(e);
        });
    }

    renderCatalogoPortal(_catalogoLibros);
}

function filtrarCatalogoPortal() {
    const q = (document.getElementById('catalogo-search-input')?.value || '').trim().toLowerCase();
    if (!q) {
        renderCatalogoPortal(_catalogoLibros);
        return;
    }
    const filtrados = _catalogoLibros.filter(b => {
        const area = String(b.area_cod || '').toLowerCase();
        const num = String(b.libro_num || '').toLowerCase();
        const combo = `${pad2(area)}${pad2(num)}`;
        const titulo = String(b.titulo || '').toLowerCase();
        const autor = String(b.autor || '').toLowerCase();
        if (area.includes(q) || num.includes(q) || combo.includes(q) || titulo.includes(q) || autor.includes(q)) return true;
        // Buscar por código completo de ejemplar (ej: 010101)
        const ejems = _catalogoEjemplares[b.id] || [];
        return ejems.some(e => String(e.codigo_ejemplar || '').toLowerCase().includes(q));
    });
    renderCatalogoPortal(filtrados);
}

function renderCatalogoPortal(lista) {
    const tbody = document.getElementById('catalogo-portal-tbody');
    const paginEl = document.getElementById('catalogo-portal-pagination');
    if (!tbody) return;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#888; padding:20px;">No se encontraron libros.</td></tr>';
        if (paginEl) paginEl.textContent = '';
        return;
    }

    const limit = 150;
    const listaRender = lista.slice(0, limit);

    tbody.innerHTML = listaRender.map(b => {
        const total = b.cantidad_total || 1;
        const disp = b.cantidad_disponible !== null ? b.cantidad_disponible : total;
        const ejems = _catalogoEjemplares[b.id] || [];

        // Chips de ejemplares con estado en color
        const chips = ejems.map(e => {
            const st = (e.estado || 'disponible').toLowerCase();
            let bg = '#d4edda', color = '#155724', border = '#c3e6cb', label = 'Disponible';
            if (st === 'prestado')       { bg = '#f8d7da'; color = '#721c24'; border = '#f5c6cb'; label = 'Prestado'; }
            else if (st === 'reservado') { bg = '#e2e3e5'; color = '#383d41'; border = '#d6d8db'; label = 'Reservado'; }
            return `<span style="font-family:monospace; background:${bg}; color:${color}; border:1px solid ${border}; padding:2px 7px; border-radius:6px; margin:2px 3px 2px 0; font-size:12px; font-weight:bold; display:inline-block;" title="${e.codigo_ejemplar} — ${label}">${e.codigo_ejemplar}</span>`;
        }).join('');

        // Disponibilidad informativa
        let dispBadge = '';
        if (disp > 0) {
            dispBadge = `<span class="badge badge-success">Disponible (${disp}/${total})</span>`;
        } else {
            dispBadge = `<span class="badge badge-danger">Agotado (0/${total})</span>`;
        }

        return `
            <tr>
                <td style="font-family:monospace; font-weight:bold; color:#0d6efd;">${pad2(b.area_cod)}${pad2(b.libro_num)}</td>
                <td style="font-size:13px;"><strong>${b.titulo}</strong></td>
                <td style="font-size:13px; color:#555;">${b.autor || '-'}</td>
                <td>${chips || '<span style="color:#aaa;">Sin ejemplares</span>'}</td>
                <td style="text-align:center;">${dispBadge}</td>
            </tr>
        `;
    }).join('');

    if (paginEl) {
        paginEl.textContent = lista.length > limit
            ? `Mostrando ${limit} de ${lista.length} libros. Usa el buscador para filtrar.`
            : `${lista.length} libro(s) en el catálogo.`;
    }
}
