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

// Helper calcularFechaDevolucion: suma 70 horas hábiles (Lunes a Viernes)
function calcularFechaDevolucion(fechaInicio = new Date(), horasHabiles = 70) {
    let fecha = new Date(parseFecha(fechaInicio).getTime());

    // Si el inicio cae en fin de semana, mover al Lunes siguiente a las 00:00
    if (fecha.getDay() === 6) {       // Sábado → Lunes
        fecha.setDate(fecha.getDate() + 2);
        fecha.setHours(0, 0, 0, 0);
    } else if (fecha.getDay() === 0) { // Domingo → Lunes
        fecha.setDate(fecha.getDate() + 1);
        fecha.setHours(0, 0, 0, 0);
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
                <td>
                    ${esActivo ? `
                        <button onclick="renovarPrestamoPortal('${p.id}', '${p.fecha_devolucion_prevista}')" class="btn-info" style="padding:4px 8px; font-size:12px;">🔄 Renovar (70h)</button>
                    ` : '<small style="color:#888;">Finalizado</small>'}
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = rowsHtml;
}

async function renovarPrestamoPortal(prestamoId, fechaDevolucionActual = null) {
    try {
        const pIdStr = String(prestamoId);
        const detRes = await tursodb.query(`SELECT libro_id, libro_titulo FROM biblioteca_prestamo_detalles WHERE prestamo_id = ?`, [pIdStr]);
        const detalles = detRes.rows || [];

        let libroConDemanda = null;
        for (const d of detalles) {
            const resCheck = await tursodb.query(
                `SELECT COUNT(*) as cant FROM biblioteca_reservas WHERE libro_id = ? AND estado = 'pendiente'`,
                [d.libro_id]
            );
            if (resCheck.rows && resCheck.rows.length > 0 && resCheck.rows[0].cant > 0) {
                libroConDemanda = d.libro_titulo;
                break;
            }
        }

        if (libroConDemanda) {
            alert(`⚠️ NO SE PUEDE RENOVAR EL PRÉSTAMO:\nEl libro "${libroConDemanda}" tiene reservas pendientes por otros usuarios.\nPor políticas de biblioteca, el libro debe ser devuelto.`);
            return;
        }

        let fechaBase = new Date();
        if (fechaDevolucionActual && fechaDevolucionActual !== 'undefined' && fechaDevolucionActual !== 'null') {
            fechaBase = parseFecha(fechaDevolucionActual);
        } else {
            const pRes = await tursodb.query(`SELECT fecha_devolucion_prevista FROM biblioteca_prestamos WHERE id = ?`, [pIdStr]);
            if (pRes.rows && pRes.rows.length > 0 && pRes.rows[0].fecha_devolucion_prevista) {
                fechaBase = parseFecha(pRes.rows[0].fecha_devolucion_prevista);
            }
        }

        const nuevaFecha = calcularFechaDevolucion(fechaBase, 70);
        await tursodb.query(
            `UPDATE biblioteca_prestamos SET fecha_devolucion_prevista = ? WHERE id = ?`,
            [nuevaFecha, String(prestamoId)]
        );

        alert(`✅ PRÉSTAMO RENOVADO EXITOSAMENTE\nSe añadieron 70 horas hábiles adicionales (3 días hábiles).\nLa nueva fecha límite de devolución es: ${formatearFechaHora(nuevaFecha)}`);
        await cargarMisPrestamos();
    } catch (e) {
        console.error('Error al renovar préstamo:', e);
        alert('❌ Error al renovar préstamo: ' + e.message);
    }
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

// ---------- 4. BUSCADOR Y CARRITO DE SOLICITUD DE PRÉSTAMO ----------

async function buscarLibrosPortal() {
    await verificarYLimpiarReservasExpiradas();
    const rawQ = (document.getElementById('user-search-book-input')?.value || '').trim();
    const resultsEl = document.getElementById('user-search-book-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<p style="color:#666; font-size:13px; text-align:center; padding:15px;">Buscando libros...</p>';

    const cleanQ = rawQ.replace(/['"]/g, '');

    let querySql = `
        SELECT e.id as ejem_id, e.codigo_ejemplar, e.ejemplar_num, e.estado as ejem_estado,
               l.id as libro_id, l.titulo, l.autor, l.editorial, l.area_cod, l.libro_num 
        FROM biblioteca_ejemplares e 
        JOIN biblioteca_libros l ON e.libro_id = l.id 
    `;

    let params = [];
    if (cleanQ) {
        querySql += ` WHERE e.codigo_ejemplar LIKE ? OR l.titulo LIKE ? OR l.autor LIKE ? OR l.area_cod LIKE ? LIMIT 30`;
        params = [`%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`];
    } else {
        querySql += ` ORDER BY CAST(l.area_cod AS INTEGER) ASC, CAST(l.libro_num AS INTEGER) ASC LIMIT 25`;
    }

    const ejemRes = await tursodb.query(querySql, params);
    const rows = ejemRes.rows || [];

    if (rows.length === 0) {
        resultsEl.innerHTML = '<p style="color:#888; font-size:13px; font-style:italic; text-align:center; padding:15px;">No se encontraron libros con esa búsqueda.</p>';
        return;
    }

    resultsEl.innerHTML = rows.map(item => {
        const estaDisponible = item.ejem_estado === 'disponible';
        const estaPrestado = item.ejem_estado === 'prestado';
        const estaReservado = item.ejem_estado === 'reservado';

        let accionesHtml = '';

        if (estaDisponible) {
            accionesHtml = `
                <button onclick="solicitarReservaConExpiracion('${item.libro_id}', '${item.ejem_id}', '${escapeHtml(item.titulo)}', '${escapeHtml(item.codigo_ejemplar)}', true)" 
                        class="btn-info" style="padding:7px 14px; font-size:13px; font-weight:bold;">
                    🔖 Reservar (12h)
                </button>
            `;
        } else if (estaPrestado) {
            accionesHtml = `
                <span class="badge badge-danger" style="margin-right:8px;">PRESTADO</span>
                <button onclick="solicitarReservaConExpiracion('${item.libro_id}', '${item.ejem_id}', '${escapeHtml(item.titulo)}', '${escapeHtml(item.codigo_ejemplar)}', false)" 
                        class="btn-info" style="padding:7px 14px; font-size:13px; font-weight:bold;">
                    🔖 Reservar
                </button>
            `;
        } else if (estaReservado) {
            accionesHtml = `<span class="badge badge-secondary" style="padding:6px 12px;">RESERVADO</span>`;
        }

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #eee; background:#fff;">
                <div style="font-size:13px; flex:1; padding-right:12px;">
                    <strong style="color:#0d6efd;">[${item.codigo_ejemplar}]</strong> <strong>${item.titulo}</strong><br>
                    <small style="color:#666;">Autor: ${item.autor || 'N/A'} | Ejemplar #${item.ejemplar_num}</small>
                </div>
                <div>
                    ${accionesHtml}
                </div>
            </div>
        `;
    }).join('');
}

async function solicitarReservaConExpiracion(libroId, ejemId, titulo, codigoEjemplar, esDisponible) {
    if (!currentUser) return;

    let mensajeConfirm = `¿Deseas solicitar una reserva del ejemplar [${codigoEjemplar}] de "${titulo}"?`;
    if (esDisponible) {
        mensajeConfirm += `\n\n📌 NOTA: Este ejemplar está actualmente disponible. Al reservarlo quedará apartado EXCLUSIVAMENTE para ti durante 12 HORAS. Si no lo recoges en ese lapso, la reserva se cancelará automáticamente.`;
    } else {
        mensajeConfirm += `\n\n📌 NOTA: Este ejemplar está actualmente prestado. Al reservarlo, el usuario actual no podrá renovar su préstamo y el libro te será asignado al momento de su devolución.`;
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
        `INSERT INTO biblioteca_reservas (id, libro_id, ejemplar_id, persona_ci, persona_nombre, persona_tipo, estado, fecha_reserva, fecha_expiracion)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [reservaId, libroId, ejemId, currentUser.ci, currentUser.nombre, currentUser.tipo, fechaReserva, fechaExpiracion]
    );

    if (esDisponible) {
        // Cambiar estado del ejemplar a 'reservado'
        await tursodb.query(`UPDATE biblioteca_ejemplares SET estado = 'reservado' WHERE id = ?`, [ejemId]);
        alert(`✅ RESERVA REGISTRADA POR 12 HORAS\nHas apartado el ejemplar [${codigoEjemplar}]. Tienes 12 horas para recogerlo en la biblioteca.`);
    } else {
        alert(`✅ RESERVA REGISTRADA\nHas reservado el libro [${codigoEjemplar}]. El usuario actual no podrá renovar el préstamo y el libro te será reservado al ser devuelto.`);
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

    const fechaPrevista = calcularFechaDevolucion(new Date(), 2);
    if (deadlineEl) {
        deadlineEl.textContent = `Devolución estimada: ${formatearFechaHora(fechaPrevista)} (3 días hábiles)`;
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
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), 2);
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

    alert(`✅ SOLICITUD REGISTRADA EXITOSAMENTE\nSe asignaron ${userCartItems.length} libro(s) a tu cuenta.\nLímite de devolución: ${formatearFechaHora(fechaDevolucionPrevista)} (70h hábiles)`);

    userCartItems = [];
    actualizarVistaCarritoUsuario();
    switchPortalTab('prestamos');
}

// ---------- 5. GESTIÓN Y SOLICITUD DE RESERVAS ----------

async function cargarMisReservas() {
    if (!currentUser) return;
    await verificarYLimpiarReservasExpiradas();
    const tbody = document.getElementById('user-reservations-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">Cargando mis reservas...</td></tr>';

    const res = await tursodb.query(
        `SELECT r.*, l.titulo as libro_titulo, l.area_cod, l.libro_num 
         FROM biblioteca_reservas r
         LEFT JOIN biblioteca_libros l ON r.libro_id = l.id
         WHERE r.persona_ci = ?
         ORDER BY r.created_at DESC`,
        [currentUser.ci]
    );

    if (!res.rows || res.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888; padding:30px;">No tienes reservas registradas.</td></tr>';
        return;
    }

    tbody.innerHTML = res.rows.map(r => {
        const esPendiente = r.estado === 'pendiente';
        let estadoBadgeHtml = '';

        if (esPendiente) {
            if (r.fecha_expiracion) {
                const msRestantes = new Date(r.fecha_expiracion).getTime() - Date.now();
                if (msRestantes > 0) {
                    const hrs = Math.floor(msRestantes / (1000 * 60 * 60));
                    const mins = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
                    estadoBadgeHtml = `<span class="badge badge-warning">RESERVADO (12h)</span><br><small style="color:#d97706; font-weight:bold;">⏱️ Expira: ${formatearFechaHora(r.fecha_expiracion)} (${hrs}h ${mins}m restantes)</small>`;
                } else {
                    estadoBadgeHtml = `<span class="badge badge-danger">EXPIRADA</span><br><small style="color:#dc2626;">Expiró el: ${formatearFechaHora(r.fecha_expiracion)}</small>`;
                }
            } else {
                estadoBadgeHtml = `<span class="badge badge-info">EN COLA DE ESPERA</span><br><small style="color:#64748b;">(Se asignará al devolver el libro)</small>`;
            }
        } else if (r.estado === 'completada') {
            estadoBadgeHtml = '<span class="badge badge-success">COMPLETADA / PRÉSTAMO</span>';
        } else if (r.estado === 'expirada') {
            estadoBadgeHtml = '<span class="badge badge-danger">EXPIRADA (12h)</span>';
        } else {
            estadoBadgeHtml = '<span class="badge badge-secondary">CANCELADA</span>';
        }

        return `
            <tr>
                <td>${formatearFechaHora(r.fecha_reserva)}</td>
                <td><strong>[${pad2(r.area_cod || '')}${pad2(r.libro_num || '')}]</strong> ${r.libro_titulo || 'Libro'}</td>
                <td>${estadoBadgeHtml}</td>
                <td>
                    ${esPendiente ? `<button onclick="cancelarReservaUsuario('${r.id}')" class="btn-danger" style="padding:4px 8px; font-size:12px;">Cancelar</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

async function cancelarReservaUsuario(reservaId) {
    if (!confirm('¿Cancelar esta solicitud de reserva?')) return;
    await tursodb.query(`UPDATE biblioteca_reservas SET estado = 'cancelada' WHERE id = ?`, [reservaId]);
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
