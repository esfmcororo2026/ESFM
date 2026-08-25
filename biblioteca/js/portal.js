// ========== PORTAL AUTÓNOMO Y ENCAPSULADO DE USUARIOS DE BIBLIOTECA ==========

let currentUser = null;
let userCartItems = [];

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

// Helper formatearFecha
function formatearFecha(fechaStr) {
    if (!fechaStr) return '-';
    const partes = fechaStr.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return fechaStr;
}

// Helper calcularFechaDevolucion (días hábiles)
function calcularFechaDevolucion(fechaInicio, diasHabiles = 3) {
    let fecha = new Date(fechaInicio);
    let agregados = 0;
    while (agregados < diasHabiles) {
        fecha.setDate(fecha.getDate() + 1);
        const diaSemana = fecha.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // Ignorar Domingo(0) y Sábado(6)
            agregados++;
        }
    }
    return fecha.toISOString().split('T')[0];
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

        // Mostrar pantalla encapsulada del usuario
        document.getElementById('section-user-auth').style.display = 'none';
        document.getElementById('section-user-portal').style.display = 'block';
        document.getElementById('portal-header-right').style.display = 'block';

        // Actualizar banner de perfil
        document.getElementById('portal-user-name').textContent = currentUser.nombre;
        document.getElementById('portal-user-detail').textContent = `C.I.: ${currentUser.ci} | ${currentUser.detalle}`;
        
        const badgeEl = document.getElementById('portal-user-badge');
        badgeEl.textContent = currentUser.tipo.toUpperCase();
        badgeEl.className = currentUser.tipo === 'estudiante' ? 'badge badge-primary' : 'badge badge-info';

        // Cargar préstamos del usuario por defecto
        switchPortalTab('prestamos');

    } catch (err) {
        console.error('Error al ingresar al portal:', err);
        errorEl.textContent = '❌ Error al consultar la base de datos. Inténtalo nuevamente.';
        errorEl.style.display = 'block';
    }
}

function cerrarSesionUsuario() {
    currentUser = null;
    userCartItems = [];
    document.getElementById('user-ci-input').value = '';
    document.getElementById('auth-error-msg').style.display = 'none';
    document.getElementById('section-user-auth').style.display = 'block';
    document.getElementById('section-user-portal').style.display = 'none';
    document.getElementById('portal-header-right').style.display = 'none';
}

// ---------- 2. NAVEGACIÓN POR PESTAÑAS EN EL PORTAL DE USUARIO ----------

function switchPortalTab(tabName) {
    const tabs = ['prestamos', 'solicitar', 'reservas'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const content = document.getElementById(`portal-tab-${t}`);
        if (btn) btn.className = `portal-tab-btn ${t === tabName ? 'active' : ''}`;
        if (content) content.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'prestamos') cargarMisPrestamos();
    if (tabName === 'solicitar') buscarLibrosPortal();
    if (tabName === 'reservas') cargarMisReservas();
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

    const hoy = new Date().toISOString().split('T')[0];
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
        } else if (p.fecha_devolucion_prevista < hoy) {
            estadoBadge = '<span class="badge badge-danger">⚠️ Vencido</span>';
        } else {
            estadoBadge = '<span class="badge badge-warning">En Préstamo</span>';
        }

        rowsHtml += `
            <tr>
                <td>${formatearFecha(p.fecha_prestamo)}</td>
                <td>${librosChipsHtml || 'Sin detalles'}</td>
                <td><strong>${formatearFecha(p.fecha_devolucion_prevista)}</strong></td>
                <td>${estadoBadge}</td>
            </tr>
        `;
    }

    tbody.innerHTML = rowsHtml;
}

// ---------- 4. BUSCADOR Y CARRITO DE SOLICITUD DE PRÉSTAMO ----------

async function buscarLibrosPortal() {
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
        resultsEl.innerHTML = '<p style="color:#888; font-size:13px; font-style:italic; text-align:center; padding:15px;">No se encontraron libros disponibles con esa búsqueda.</p>';
        return;
    }

    resultsEl.innerHTML = rows.map(item => {
        const enCarrito = userCartItems.some(c => c.ejemId === item.ejem_id);
        const estaDisponible = item.ejem_estado === 'disponible';
        const disabled = !estaDisponible || enCarrito;
        const btnText = enCarrito ? 'En Carrito' : (!estaDisponible ? `[${item.ejem_estado.toUpperCase()}]` : '+ Seleccionar');

        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee; background:#fff;">
                <div style="font-size:13px; flex:1; padding-right:10px;">
                    <strong style="color:#0d6efd;">[${item.codigo_ejemplar}]</strong> <strong>${item.titulo}</strong><br>
                    <small style="color:#666;">Autor: ${item.autor || 'N/A'} | Ejemplar #${item.ejemplar_num}</small>
                </div>
                <button onclick="agregarAlCarritoUsuario('${item.ejem_id}', '${item.libro_id}', '${escapeHtml(item.codigo_ejemplar)}', '${escapeHtml(item.titulo)} (#${item.ejemplar_num})')" 
                        class="${disabled ? 'btn-secondary' : 'btn-success'}" 
                        style="padding:6px 12px; font-size:12px; white-space:nowrap;" ${disabled ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
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

    const fechaPrevista = calcularFechaDevolucion(new Date(), 3);
    if (deadlineEl) {
        deadlineEl.textContent = `Devolución estimada: ${formatearFecha(fechaPrevista)} (3 días hábiles)`;
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

    const fechaHoy = new Date().toISOString().split('T')[0];
    const fechaDevolucionPrevista = calcularFechaDevolucion(new Date(), 3);
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

    alert(`✅ SOLICITUD REGISTRADA EXITOSAMENTE\nSe asignaron ${userCartItems.length} libro(s) a tu cuenta.\nFecha límite de devolución: ${formatearFecha(fechaDevolucionPrevista)}`);

    userCartItems = [];
    actualizarVistaCarritoUsuario();
    switchPortalTab('prestamos');
}

// ---------- 5. GESTIÓN Y SOLICITUD DE RESERVAS ----------

async function cargarMisReservas() {
    if (!currentUser) return;
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
        const badgeClass = esPendiente ? 'badge-warning' : (r.estado === 'completada' ? 'badge-success' : 'badge-secondary');

        return `
            <tr>
                <td>${formatearFecha(r.fecha_reserva?.split('T')[0] || r.fecha_reserva)}</td>
                <td><strong>[${pad2(r.area_cod || '')}${pad2(r.libro_num || '')}]</strong> ${r.libro_titulo || 'Libro'}</td>
                <td><span class="badge ${badgeClass}">${String(r.estado).toUpperCase()}</span></td>
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
