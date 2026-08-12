let html5QrCode = null;
let isScanning = false;
let isFirstScan = true; // Nueva variable para controlar el primer escaneo
let isFlashOn = false;
let currentUser = null;
let currentProfile = null;
let currentEventId = null;
let eventoTimer = null;
let currentPage = 1;
const eventsPerPage = 5;
let totalEvents = 0;
let allEvents = [];
let currentEspecialidad = null;
let currentAnio = null;
let qrCodesGenerated = [];
let currentEventoId = null;
let currentEventoNombre = null;

// ========== SISTEMA ADAPTATIVO DE LATENCIA ==========

// Umbrales optimizados basados en pruebas reales (2G + WiFi)
const OPTIMAL_RESPONSE_TIME = 3.0; // segundos - tiempo óptimo ajustado
const CRITICAL_THRESHOLD = 4.5;    // segundos - umbral crítico balanceado
const OFFLINE_THRESHOLD = 5.5;     // segundos - activar modo offline

// Variables de control de latencia
let latencyHistory = [];
let consecutiveSlowRequests = 0;
let isAdaptiveOfflineMode = false;
let lastLatencyCheck = 0;

// Medir latencia de una operación
function measureLatency(startTime) {
    const endTime = Date.now();
    const latency = (endTime - startTime) / 1000; // en segundos
    
    // Mantener historial de últimas 10 mediciones
    latencyHistory.push(latency);
    if (latencyHistory.length > 10) {
        latencyHistory.shift();
    }
    
    return latency;
}

// Evaluar si debe activar modo offline adaptativo
function evaluateNetworkCondition(latency) {
    // Evaluación de red deshabilitada - solo modo manual
    return false;
}

// Activar modo offline adaptativo - DESHABILITADO
function activateAdaptiveOfflineMode() {
    // Modo adaptativo deshabilitado - solo manual
    console.log('Modo adaptativo deshabilitado');
}

// Desactivar modo offline adaptativo - DESHABILITADO
function deactivateAdaptiveOfflineMode() {
    // Modo adaptativo deshabilitado - solo manual
}

// Sincronización adaptativa más frecuente - DESHABILITADO
function startAdaptiveSync() {
    // Sincronización adaptativa deshabilitada - solo manual
}

// Mostrar estadísticas de latencia en consola
function showLatencyStats() {
    if (latencyHistory.length > 0) {
        const avg = latencyHistory.reduce((a, b) => a + b) / latencyHistory.length;
        const recent = latencyHistory.slice(-3);
        const recentAvg = recent.reduce((a, b) => a + b) / recent.length;
        
        console.log('📊 ESTADÍSTICAS DE LATENCIA:');
        console.log(`   Promedio general: ${avg.toFixed(1)}s`);
        console.log(`   Promedio reciente: ${recentAvg.toFixed(1)}s`);
        console.log(`   Estado: ${isAdaptiveOfflineMode ? 'OFFLINE ADAPTATIVO' : 'ONLINE'}`);
        console.log(`   Umbral crítico: ${CRITICAL_THRESHOLD}s`);
    }
}

// ========== SISTEMA OFFLINE PARA OPTIMIZAR ANCHO DE BANDA ==========
let offlineQueue = [];
let syncInProgress = false;
let lastSyncTime = 0;
const SYNC_INTERVAL = 30000; // 30 segundos
const MAX_BATCH_SIZE = 10; // Máximo 10 asistencias por lote
let estudiantesCache = []; // Cache local de estudiantes

// Cargar cache de estudiantes desde localStorage
function loadEstudiantesCache() {
    try {
        const saved = localStorage.getItem('estudiantes_cache');
        estudiantesCache = saved ? JSON.parse(saved) : [];
    } catch (error) {
        estudiantesCache = [];
    }
}

// Guardar cache de estudiantes en localStorage
function saveEstudiantesCache() {
    try {
        localStorage.setItem('estudiantes_cache', JSON.stringify(estudiantesCache));
    } catch (error) {
        estudiantesCache = [];
    }
}

// Actualizar cache de estudiantes
async function updateEstudiantesCache() {
    try {
        const { data, error } = await tursodb.from('estudiantes').select('*');
        if (!error && data) {
            estudiantesCache = data;
            saveEstudiantesCache();
        }
    } catch (error) {}
}

// Buscar estudiante en cache local
function findEstudianteInCache(codigoUnico) {
    return estudiantesCache.find(est => est.codigo_unico === codigoUnico);
}

// Cargar cola offline desde localStorage
function loadOfflineQueue() {
    try {
        const saved = localStorage.getItem('asistencias_offline');
        offlineQueue = saved ? JSON.parse(saved) : [];
        updateOfflineIndicator();
    } catch (error) {
        offlineQueue = [];
    }
}

// Guardar cola offline en localStorage
function saveOfflineQueue() {
    try {
        localStorage.setItem('asistencias_offline', JSON.stringify(offlineQueue));
        updateOfflineIndicator();
    } catch (error) {
        console.error('Error guardando cola offline:', error);
    }
}

// Actualizar indicador visual de estado offline
function updateOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (!indicator) return;
    
    if (offlineQueue.length > 0) {
        indicator.style.display = 'block';
        indicator.textContent = `📱 ${offlineQueue.length} pendientes`;
        indicator.className = 'offline-indicator pending';
    } else {
        indicator.style.display = 'none';
    }
}

// Agregar asistencia a cola offline
function addToOfflineQueue(personaId, eventoId, timestamp = null, tipo = 'estudiante') {
    // VERIFICAR DUPLICADOS EN COLA OFFLINE ANTES DE AGREGAR
    const yaExisteEnCola = offlineQueue.find(a => 
        a.persona_id === personaId && a.evento_id === eventoId && a.tipo === tipo
    );
    
    if (yaExisteEnCola) {
        console.log('Asistencia ya existe en cola offline, no se agrega duplicado');
        return false; // No se agregó
    }
    
    const asistencia = {
        id: Date.now() + Math.random(), // ID único temporal
        persona_id: personaId,
        evento_id: eventoId,
        timestamp: timestamp || new Date().toISOString(),
        tipo: tipo,
        created_offline: true
    };
    
    offlineQueue.push(asistencia);
    saveOfflineQueue();
    console.log('Asistencia agregada a cola offline:', asistencia);
    return true; // Se agregó correctamente
}

// Sincronizar cola offline con servidor
async function syncOfflineQueue() {
    if (syncInProgress || offlineQueue.length === 0) return;
    
    console.log(`🔄 Iniciando sincronización de ${offlineQueue.length} registros...`);
    syncInProgress = true;
    const indicator = document.getElementById('offline-indicator');
    
    try {
        if (indicator) {
            indicator.textContent = '🔄 Sincronizando...';
            indicator.className = 'offline-indicator syncing';
        }
        
        // NO ELIMINAR de la cola hasta confirmar que se guardó
        const batch = offlineQueue.slice(0, MAX_BATCH_SIZE);
        console.log('Lote a sincronizar:', batch);
        let syncedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const syncedIndices = [];
        
        for (let i = 0; i < batch.length; i++) {
            const asistencia = batch[i];
            
            try {
                const tabla = asistencia.tipo === 'personal' ? 'asistencias_personal' : 'asistencias';
                const campo = asistencia.tipo === 'personal' ? 'personal_id' : 'estudiante_id';
                const personaId = asistencia.persona_id;

                // VERIFICAR SI YA EXISTE antes de insertar
                const existente = await tursodb.query(`
                    SELECT id FROM ${tabla} WHERE ${campo} = ? AND evento_id = ?
                `, [personaId, asistencia.evento_id]);
                
                if (existente && existente.rows && existente.rows.length > 0) {
                    skippedCount++;
                    syncedIndices.push(i);
                } else {
                    const result = await tursodb.query(`
                        INSERT INTO ${tabla} (id, ${campo}, evento_id, timestamp)
                        VALUES (?, ?, ?, ?)
                    `, [Date.now().toString() + i, personaId, asistencia.evento_id, asistencia.timestamp]);
                    
                    if (!result.error) {
                        syncedCount++;
                        syncedIndices.push(i);
                    } else {
                        errorCount++;
                    }
                }
            } catch (err) {
                errorCount++;
                console.error('Error sincronizando:', err);
            }
        }
        
        console.log(`Resumen: ${syncedCount} nuevas, ${skippedCount} duplicadas, ${errorCount} errores`);
        
        // Eliminar solo los que se sincronizaron correctamente (en orden inverso)
        for (let i = syncedIndices.length - 1; i >= 0; i--) {
            offlineQueue.splice(syncedIndices[i], 1);
        }
        
        console.log(`Cola offline después de sincronizar: ${offlineQueue.length} pendientes`);
        saveOfflineQueue();
        lastSyncTime = Date.now();
        
        if (syncedCount > 0 || skippedCount > 0) {
            console.log(`Sincronización: ${syncedCount} nuevas, ${skippedCount} ya existían`);
            // Recargar lista de asistencias si estamos en la pantalla del escáner
            if (currentEventId && document.getElementById('scanner-section').classList.contains('active')) {
                console.log('Recargando lista de asistencias...');
                await loadAsistencias(currentEventId);
            }
        }
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    } finally {
        syncInProgress = false;
        updateOfflineIndicator();
    }
}

// Iniciar sincronización automática - DESHABILITADO
function startAutoSync() {}

// Forzar sincronización manual
async function forceSyncOffline() {
    const cantidadInicial = offlineQueue.length;
    console.log(`🔄 Sincronización manual iniciada. Registros pendientes: ${cantidadInicial}`);
    
    if (cantidadInicial === 0) {
        alert('ℹ️ No hay registros offline para sincronizar');
        return;
    }
    
    // Usar la misma función que la sincronización automática (con validación de duplicados)
    await syncOfflineQueue();
    
    // Recargar lista si estamos en el escáner
    if (currentEventId && document.getElementById('scanner-section').classList.contains('active')) {
        await loadAsistencias(currentEventId);
    }
    
    const cantidadFinal = offlineQueue.length;
    const sincronizados = cantidadInicial - cantidadFinal;
    
    // Mostrar resultado al usuario
    if (offlineQueue.length === 0) {
        alert(`✅ Sincronización completada\n\n${sincronizados} asistencias sincronizadas correctamente.`);
    } else {
        alert(`⚠️ Sincronización parcial\n\nSincronizados: ${sincronizados}\nPendientes: ${offlineQueue.length}\n\nPuede ser por problemas de conexión.`);
    }
}

// ========== FUNCIONES DE AUDITORÍA ==========



// FUNCIÓN DE AUDITORÍA: Auditar asistencias de un evento
async function auditarAsistencias() {
    if (!currentEventoId) {
        alert('Abre primero la lista de asistencias de un evento');
        return;
    }
    
    try {
        const result = await tursodb.query(`
            SELECT 
                a.id as asistencia_id,
                a.timestamp,
                e.codigo_unico,
                e.nombre,
                e.apellido_paterno,
                e.apellido_materno,
                e.especialidad,
                e.anio_formacion,
                COUNT(*) OVER (PARTITION BY e.id) as veces_registrado
            FROM asistencias a
            JOIN estudiantes e ON a.estudiante_id = e.id
            WHERE a.evento_id = ?
            ORDER BY e.codigo_unico, a.timestamp
        `, [currentEventoId]);
        
        console.log('=== AUDITORÍA DE ASISTENCIAS ===');
        console.log(`Total asistencias: ${result.rows?.length || 0}`);
        
        if (result.rows) {
            // Agrupar por especialidad y año
            const grupos = {};
            const duplicados = [];
            
            result.rows.forEach(row => {
                const key = `${row.especialidad} - ${row.anio_formacion}`;
                if (!grupos[key]) grupos[key] = [];
                grupos[key].push(row);
                
                if (row.veces_registrado > 1) {
                    duplicados.push(row);
                }
            });
            
            console.log('\n--- POR ESPECIALIDAD Y AÑO ---');
            Object.keys(grupos).forEach(key => {
                console.log(`${key}: ${grupos[key].length} asistencias`);
            });
            
            let mensaje = `📊 AUDITORÍA DEL EVENTO\n\n`;
            mensaje += `Total asistencias: ${result.rows.length}\n\n`;
            
            mensaje += `Por especialidad y año:\n`;
            Object.keys(grupos).forEach(key => {
                mensaje += `• ${key}: ${grupos[key].length}\n`;
            });
            
            if (duplicados.length > 0) {
                console.log('\n--- DUPLICADOS DETECTADOS ---');
                duplicados.forEach(dup => {
                    console.log(`${dup.codigo_unico} - ${dup.nombre} ${dup.apellido_paterno}: ${dup.veces_registrado} veces`);
                });
                mensaje += `\n⚠️ DUPLICADOS DETECTADOS: ${duplicados.length}\n`;
                mensaje += `\nLos duplicados se eliminan automáticamente al abrir "Ver Lista".`;
            } else {
                mensaje += `\n✅ No se encontraron duplicados`;
            }
            
            alert(mensaje);
            console.log('🔍 Revisa la consola para análisis detallado');
        }
        
    } catch (error) {
        console.error('Error en auditoría:', error);
        alert('Error realizando auditoría: ' + error.message);
    }
}



// ========== AUTENTICACIÓN CON SUPABASE AUTH ==========

function togglePassword() {
    const input = document.getElementById('password');
    const btn = document.querySelector('.toggle-password');
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.style.opacity = '1';
    } else {
        input.type = 'password';
        btn.textContent = '👁';
        btn.style.opacity = '0.5';
    }
}

// Enter para login
document.addEventListener('DOMContentLoaded', function() {
    ['email', 'password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') login();
        });
    });
});

async function login() {
    const emailOrCi = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    if (!emailOrCi || !password) {
        errorEl.textContent = 'Completa todos los campos';
        return;
    }

    try {
        let email = emailOrCi;
        
        // Si es el CI del admin, convertir a email
        if (emailOrCi === '79310777') {
            email = 'admin@escuela.com';
        }

        // Buscar usuario en tabla usuarios
        const result = await tursodb.query(`SELECT * FROM usuarios WHERE (email = ? OR ci = ?) AND password = ?`, [email, emailOrCi, password]);

        if (!result.rows || result.rows.length === 0) {
            errorEl.textContent = 'Credenciales incorrectas';
            return;
        }

        const user = result.rows[0];
        localStorage.setItem('currentUser', JSON.stringify(user));
        currentUser = user;
        showDashboard();
    } catch (err) {
        errorEl.textContent = 'Error de conexión: ' + err.message;
    }
}

async function logout() {
    await tursodb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    showLogin();
}

function isAdmin() {
    return currentProfile?.rol === 'admin';
}

function isUsuario() {
    return currentProfile?.rol === 'usuario';
}



function showLogin() {
    hideAllSections();
    document.getElementById('login-section').classList.add('active');
}

function showDashboard() {
    hideAllSections();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const rol = user ? user.rol : '';

    if (rol === 'usuario') {
        showAsistenciaModule();
        return;
    }
    if (rol === 'docente') {
        window.location.href = 'docentes/index.html';
        return;
    }

    // admin: mostrar dashboard completo
    document.getElementById('dashboard-section').classList.add('active');
    updateAllUserDropdowns();
}

function updateAllUserDropdowns() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (user) {
        document.querySelectorAll('.user-display-name').forEach(el => {
            el.textContent = user.nombre;
        });
        document.querySelectorAll('.dropdown-rol').forEach(el => {
            el.textContent = user.rol.toUpperCase();
        });
    }
}

function toggleUserDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId || 'user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(event) {
    const dropdowns = document.querySelectorAll('.user-dropdown');
    dropdowns.forEach(dropdown => {
        if (dropdown && !dropdown.contains(event.target)) {
            dropdown.classList.remove('active');
        }
    });
});

function showAsistenciaModule() {
    hideAllSections();
    document.getElementById('asistencia-module-section').classList.add('active');
    updateAllUserDropdowns();
    loadEventos();
}

function showBibliotecaModule() {
    if (!isAdmin()) {
        alert('Solo administradores pueden acceder a Biblioteca');
        return;
    }
    window.location.href = 'biblioteca/index.html';
}

function showGestionUsuarios() {
    hideAllSections();
    document.getElementById('gestion-usuarios-section').classList.add('active');
    updateAllUserDropdowns();
}

function showRegistroDocentes() {
    hideAllSections();
    document.getElementById('registro-docentes-section').classList.add('active');
}

function showCargaMasiva() {
    hideAllSections();
    document.getElementById('carga-masiva-section').classList.add('active');
    updateAllUserDropdowns();
    mostrarCargaNueva();
}

function mostrarCargaNueva() {
    document.getElementById('seccion-carga-nueva').style.display = 'block';
    document.getElementById('seccion-actualizacion').style.display = 'none';
    document.getElementById('btn-carga-nueva').className = 'btn-primary';
    document.getElementById('btn-actualizacion').className = 'btn-secondary';
    document.getElementById('resultado-carga').innerHTML = '';
}

function mostrarActualizacion() {
    document.getElementById('seccion-carga-nueva').style.display = 'none';
    document.getElementById('seccion-actualizacion').style.display = 'block';
    document.getElementById('btn-carga-nueva').className = 'btn-secondary';
    document.getElementById('btn-actualizacion').className = 'btn-primary';
    document.getElementById('admin-password-update').value = '';
    document.getElementById('resultado-carga').innerHTML = '';
}

async function actualizarBDCompleta() {
    const password = document.getElementById('admin-password-update').value;
    const fileInput = document.getElementById('excel-file-update');
    const resultadoDiv = document.getElementById('resultado-carga');
    
    if (!password) {
        alert('Ingresa tu contraseña de administrador');
        return;
    }
    
    if (password !== 'Admin123!') {
        resultadoDiv.innerHTML = '<p style="color: red;">❌ Contraseña incorrecta</p>';
        return;
    }
    
    if (!fileInput.files[0]) {
        alert('Selecciona un archivo Excel');
        return;
    }
    
    const confirmacion = confirm('⚠️ CONFIRMACIÓN DE ACTUALIZACIÓN\n\nEsto eliminará TODOS los estudiantes actuales y cargará los nuevos desde Excel.\n\n¿Continuar?');
    
    if (!confirmacion) {
        resultadoDiv.innerHTML = '<p style="color: orange;">🛑 Operación cancelada</p>';
        return;
    }
    
    try {
        resultadoDiv.innerHTML = '<p style="color: blue;">🔄 Actualizando base de datos...</p>';
        
        // Contar estudiantes actuales
        const countResult = await tursodb.query('SELECT COUNT(*) as total FROM estudiantes');
        const estudiantesAnteriores = countResult.rows[0]?.total || 0;
        
        // Eliminar datos existentes
        await tursodb.query('DELETE FROM asistencias');
        await tursodb.query('DELETE FROM estudiantes');
        
        resultadoDiv.innerHTML = '<p style="color: blue;">📄 Procesando archivo Excel...</p>';
        
        // Procesar el nuevo archivo
        await procesarExcelInterno(fileInput.files[0], resultadoDiv, estudiantesAnteriores);
        
    } catch (error) {
        console.error('Error actualizando BD:', error);
        resultadoDiv.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
    }
}

function showLimpiarBD() {
    // Función obsoleta - redirigir a actualización
    showCargaMasiva();
    mostrarActualizacion();
}

async function confirmarLimpiarBD() {
    // Función obsoleta - mantener por compatibilidad
    alert('Esta función se ha movido a "Carga Masiva > Actualizar Existentes"');
}

async function registrarDocente() {
    const ci = document.getElementById('docente-ci').value;
    const nombre = document.getElementById('docente-nombre').value;
    const email = document.getElementById('docente-email').value;
    const password = document.getElementById('docente-password').value;
    const celular = document.getElementById('docente-celular').value;

    if (!ci || !nombre || !email || !password) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    try {
        const { data, error } = await tursodb.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nombre,
                    ci,
                    celular: celular || null,
                    rol: 'usuario'
                }
            }
        });

        if (error) {
            alert('Error: ' + error.message);
            return;
        }

        document.getElementById('docente-ci').value = '';
        document.getElementById('docente-nombre').value = '';
        document.getElementById('docente-email').value = '';
        document.getElementById('docente-password').value = '';
        document.getElementById('docente-celular').value = '';

        alert('✓ Docente registrado correctamente');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function procesarExcel() {
    const fileInput = document.getElementById('excel-file');
    const resultadoDiv = document.getElementById('resultado-carga');
    
    if (!fileInput.files[0]) {
        alert('Selecciona un archivo Excel');
        return;
    }
    
    await procesarExcelInterno(fileInput.files[0], resultadoDiv, 0);
}

async function procesarExcelInterno(file, resultadoDiv, estudiantesAnteriores = 0) {
    console.log('Archivo seleccionado:', file.name, 'Tamaño:', file.size);
    resultadoDiv.innerHTML = '<p style="color: blue;">📁 Leyendo archivo Excel...</p>';

    try {
        const data = await file.arrayBuffer();
        console.log('Archivo leído, tamaño del buffer:', data.byteLength);
        resultadoDiv.innerHTML = '<p style="color: blue;">📊 Procesando datos...</p>';
        
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('Datos extraídos:', jsonData.length, 'filas');
        console.log('Primeras 3 filas:', jsonData.slice(0, 3));

        if (jsonData.length === 0) {
            resultadoDiv.innerHTML = '<p style="color: red;">❌ El archivo está vacío</p>';
            return;
        }

        // Detectar si tiene cabeceras
        let startRow = 0;
        const firstRow = jsonData[0];
        if (firstRow && firstRow.some(cell => 
            typeof cell === 'string' && 
            (cell.toLowerCase().includes('nombre') || 
             cell.toLowerCase().includes('dni') || 
             cell.toLowerCase().includes('codigo'))
        )) {
            startRow = 1;
            console.log('Cabeceras detectadas, iniciando desde fila 2');
        } else {
            console.log('Sin cabeceras, procesando desde fila 1');
        }

        let exitosos = 0;
        let errores = 0;
        const erroresDetalle = [];
        const totalFilas = jsonData.length - startRow;
        
        resultadoDiv.innerHTML = `<p style="color: blue;">⏳ Procesando ${totalFilas} estudiantes...</p>`;

        for (let i = startRow; i < jsonData.length; i++) {
            const fila = jsonData[i];
            
            // Actualizar progreso cada 10 registros
            if ((i - startRow) % 10 === 0) {
                const progreso = Math.round(((i - startRow) / totalFilas) * 100);
                resultadoDiv.innerHTML = `<p style="color: blue;">⏳ Procesando... ${progreso}% (${i - startRow}/${totalFilas})</p>`;
            }
            
            // Saltar filas vacías
            if (!fila || fila.every(cell => !cell)) {
                console.log(`Fila ${i + 1} vacía, saltando`);
                continue;
            }
            
            try {
                const estudiante = {
                    codigo_unico: fila[0] ? fila[0].toString().trim() : '',
                    dni: fila[1] ? fila[1].toString().trim() : '',
                    nombre: fila[2] ? fila[2].toString().toUpperCase().trim() : '',
                    apellido_paterno: fila[3] ? fila[3].toString().toUpperCase().trim() : '',
                    apellido_materno: fila[4] ? fila[4].toString().toUpperCase().trim() : '',
                    especialidad: fila[5] ? fila[5].toString().toUpperCase().trim() : '',
                    anio_formacion: fila[6] ? fila[6].toString().toUpperCase().trim() : '',
                    celular: fila[7] ? fila[7].toString().trim() : null,
                    email: fila[8] ? fila[8].toString().toLowerCase().trim() : null,
                    password: fila[9] ? fila[9].toString().trim() : 'estudiante123' // Nueva columna de contraseña
                };
                
                // Detectar y corregir datos mal estructurados (nombre en posición incorrecta)
                if (!estudiante.apellido_paterno && estudiante.nombre && estudiante.apellido_materno) {
                    // Caso: RAMIREZ,,JOSE LUIS -> JOSE LUIS,RAMIREZ,SIN DATO
                    const temp = estudiante.nombre;
                    estudiante.nombre = estudiante.apellido_materno;
                    estudiante.apellido_paterno = temp;
                    estudiante.apellido_materno = 'SIN DATO';
                    console.log(`Fila ${i + 1}: Datos reestructurados - Nombre: ${estudiante.nombre}, Apellido: ${estudiante.apellido_paterno}`);
                }

                // Validar campos obligatorios (apellido materno es opcional)
                if (!estudiante.codigo_unico || !estudiante.dni || !estudiante.nombre || !estudiante.apellido_paterno || !estudiante.especialidad || !estudiante.anio_formacion) {
                    errores++;
                    const camposFaltantes = [];
                    if (!estudiante.codigo_unico) camposFaltantes.push('código');
                    if (!estudiante.dni) camposFaltantes.push('DNI');
                    if (!estudiante.nombre) camposFaltantes.push('nombre');
                    if (!estudiante.apellido_paterno) camposFaltantes.push('apellido paterno');
                    if (!estudiante.especialidad) camposFaltantes.push('especialidad');
                    if (!estudiante.anio_formacion) camposFaltantes.push('año de formación');
                    
                    const errorMsg = `Fila ${i + 1} (${estudiante.codigo_unico || 'Sin código'}): Faltan campos obligatorios: ${camposFaltantes.join(', ')}`;
                    erroresDetalle.push(errorMsg);
                    console.log(`❌ ${errorMsg}`);
                    console.log('Datos de la fila:', estudiante);
                    continue;
                }
                
                // Si apellido materno está vacío, usar "SIN DATO"
                if (!estudiante.apellido_materno) {
                    estudiante.apellido_materno = 'SIN DATO';
                    console.log(`Fila ${i + 1}: Apellido materno vacío, usando "SIN DATO"`);
                }
                
                console.log(`Insertando estudiante ${exitosos + 1}:`, estudiante.codigo_unico, estudiante.nombre);
                
                const { error } = await tursodb.from('estudiantes').insert(estudiante);

                if (error) {
                    errores++;
                    erroresDetalle.push(`Fila ${i + 1}: ${error.message}`);
                    console.error(`Error insertando fila ${i + 1}:`, error);
                } else {
                    exitosos++;
                }
            } catch (err) {
                errores++;
                erroresDetalle.push(`Fila ${i + 1}: ${err.message}`);
                console.error(`Error procesando fila ${i + 1}:`, err);
            }
        }

        let resultado = `<h4>📊 Proceso completado:</h4>`;
        resultado += `<p style="color: green; font-size: 18px;">✅ Estudiantes cargados: <strong>${exitosos}</strong></p>`;
        if (errores > 0) {
            resultado += `<p style="color: red; font-size: 18px;">❌ Errores encontrados: <strong>${errores}</strong></p>`;
            resultado += `<p style="color: orange; font-size: 14px;">⚠️ Revisa los datos y corrige los errores antes de continuar</p>`;
        }
        
        if (erroresDetalle.length > 0) {
            resultado += `<details style="margin-top: 15px;"><summary style="cursor: pointer; font-weight: bold;">👁️ Ver detalles de errores (${errores})</summary><ul style="margin-top: 10px;">`;
            erroresDetalle.slice(0, 20).forEach(error => {
                resultado += `<li style="color: red; margin: 5px 0;">${error}</li>`;
            });
            if (erroresDetalle.length > 20) {
                resultado += `<li style="color: orange;">... y ${erroresDetalle.length - 20} errores más</li>`;
            }
            resultado += `</ul></details>`;
        }

        resultadoDiv.innerHTML = resultado;
        console.log('Proceso completado:', { exitosos, errores });
        
        if (exitosos > 0) {
            setTimeout(() => {
                if (errores > 0) {
                    alert(`⚠️ Proceso completado con errores\n✅ ${exitosos} estudiantes cargados\n❌ ${errores} errores encontrados\n\nRevisa los detalles en pantalla y corrige los datos faltantes.`);
                } else {
                    const mensaje = estudiantesAnteriores > 0 
                        ? `🔄 ¡Base de datos actualizada!\n❌ ${estudiantesAnteriores} estudiantes anteriores eliminados\n✅ ${exitosos} nuevos estudiantes cargados\n❌ 0 errores`
                        : `🎉 ¡Proceso completado exitosamente!\n✅ ${exitosos} estudiantes cargados\n❌ 0 errores`;
                    alert(mensaje);
                }
            }, 1000);
        } else if (errores > 0) {
            setTimeout(() => {
                alert(`❌ No se pudo cargar ningún estudiante\n${errores} errores encontrados\n\nRevisa el formato del archivo Excel.`);
            }, 1000);
        }

    } catch (error) {
        console.error('Error general:', error);
        resultadoDiv.innerHTML = `<p style="color: red;">❌ Error procesando archivo: ${error.message}</p>`;
        alert('Error: ' + error.message);
    }
}

function showCreateEvent() {
    hideAllSections();
    document.getElementById('create-event-section').classList.add('active');
    updateAllUserDropdowns();
}

function showScanner(eventoId, eventoNombre) {
    hideAllSections();
    currentEventId = eventoId;
    document.getElementById('evento-title').textContent = eventoNombre;
    document.getElementById('scanner-section').classList.add('active');
    updateAllUserDropdowns();
    
    validarEventoActivo(eventoId).then(esValido => {
        if (esValido) {
            // Actualizar cache de estudiantes antes de iniciar el escáner
            updateEstudiantesCache();
            startScanner();
            loadAsistencias(eventoId);
            iniciarMonitoreoEvento(eventoId);
        }
    });
}

function isAdmin() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    return currentUser && currentUser.rol === 'admin';
}

function showEstudiantes() {
    if (!isAdmin()) {
        alert('Solo administradores pueden gestionar estudiantes');
        return;
    }
    origenGestion = 'asistencia'; // Marcar que venimos de asistencia
    hideAllSections();
    document.getElementById('estudiantes-section').classList.add('active');
    updateAllUserDropdowns();
    loadEstudiantes();
    
    // Cambiar botón volver según origen
    const volverBtn = document.querySelector('#estudiantes-section .header-right button');
    volverBtn.onclick = () => showAsistenciaModule();
}

function showAgregarEstudiante() {
    hideAllSections();
    document.getElementById('agregar-estudiante-section').classList.add('active');
}

function hideAllSections() {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Detener temporizador si existe
    if (eventoTimer) {
        clearInterval(eventoTimer);
        eventoTimer = null;
    }
    
    // Detener escáner si está activo
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop();
    }
}

// ========== EVENTOS ==========

async function crearEvento() {
    const nombre = document.getElementById('evento-nombre').value;
    const fecha = document.getElementById('evento-fecha').value;
    const horaInicio = document.getElementById('evento-hora-inicio').value;
    const horaFin = document.getElementById('evento-hora-fin').value;

    if (!nombre || !fecha || !horaInicio || !horaFin) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    if (horaFin <= horaInicio) {
        alert('La hora fin debe ser posterior a la hora inicio');
        return;
    }

    await tursodb.from('eventos').insert({
        nombre,
        fecha_inicio: fecha,
        fecha_fin: fecha, // Misma fecha para inicio y fin
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        imagen_url: null,
        usuario_id: currentUser.id,
        activo: true
    });

    document.getElementById('evento-nombre').value = '';
    document.getElementById('evento-fecha').value = '';
    document.getElementById('evento-hora-inicio').value = '08:00';
    document.getElementById('evento-hora-fin').value = '18:00';

    showAsistenciaModule();
}

async function loadEventos(page = 1) {
    currentPage = page;
    const listEl = document.getElementById('eventos-list');
    const paginationEl = document.getElementById('pagination-controls');
    
    listEl.innerHTML = '<p style="color: white;">Cargando...</p>';
    paginationEl.innerHTML = '';

    const { data, error } = await tursodb
        .from('eventos')
        .select('*');

    if (error) {
        listEl.innerHTML = '<p style="color: white;">Error cargando eventos</p>';
        return;
    }

    // Filtrar eventos según rol
    let eventos = data || [];
    // Los usuarios pueden ver todos los eventos para tomar asistencia
    // Solo filtrar si es necesario para otras funciones específicas
    
    // Filtrar solo eventos activos
    eventos = eventos.filter(evento => evento.activo);
    
    // Ordenar por fecha de creación (más recientes primero)
    eventos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    allEvents = eventos;
    totalEvents = eventos.length;

    if (totalEvents === 0) {
        listEl.innerHTML = '<p style="color: white; text-align: center;">No hay eventos. Crea uno para comenzar.</p>';
        return;
    }

    // Calcular eventos para la página actual
    const startIndex = (currentPage - 1) * eventsPerPage;
    const endIndex = startIndex + eventsPerPage;
    const eventosPage = eventos.slice(startIndex, endIndex);

    // Mostrar eventos de la página actual
    listEl.innerHTML = '';
    
    for (const evento of eventosPage) {
        // Verificar si tiene asistencias
        const { data: asistencias } = await tursodb.query(`
            SELECT COUNT(*) as total FROM asistencias WHERE evento_id = ?
        `, [evento.id]);
        
        const tieneAsistencias = asistencias && asistencias[0] && parseInt(asistencias[0].total) > 0;
        console.log(`Evento ${evento.nombre}: ${asistencias?.[0]?.total || 0} asistencias - Tiene asistencias: ${tieneAsistencias}`);
        
        const card = document.createElement('div');
        card.className = 'evento-card';
        const fechaInicio = evento.fecha_inicio.split('T')[0].split('-');
        const fechaFin = evento.fecha_fin.split('T')[0].split('-');
        const fechaInicioStr = `${fechaInicio[2]}/${fechaInicio[1]}/${fechaInicio[0]}`;
        const fechaFinStr = `${fechaFin[2]}/${fechaFin[1]}/${fechaFin[0]}`;
        const rangoFecha = fechaInicioStr === fechaFinStr ? fechaInicioStr : `${fechaInicioStr} - ${fechaFinStr}`;
        
        card.innerHTML = `
            <div class="evento-info">
                <h3>${evento.nombre}</h3>
                <p>📅 ${rangoFecha}</p>
                <p>🕒 ${evento.hora_inicio} - ${evento.hora_fin}</p>
            </div>
            <div class="evento-actions">
                <button class="btn-asistencia" onclick="showScanner('${evento.id}', '${evento.nombre}')">
                    Tomar Asistencia
                </button>
                <button class="btn-info" onclick="verListaAsistencias('${evento.id}', '${evento.nombre.replace(/'/g, "\\'")}')">📋 Ver Lista</button>
                ${isAdmin() ? 
                    `<button class="btn-warning" onclick="editarEvento('${evento.id}')">✏️ Editar</button>` : ''
                }
                ${!tieneAsistencias && isAdmin() ? 
                    `<button class="btn-danger" onclick="eliminarEvento('${evento.id}')">🗑️ Eliminar</button>` : ''
                }
            </div>
        `;
        listEl.appendChild(card);
    }
    
    // Mostrar controles de paginación
    renderPagination();
}

function renderPagination() {
    const paginationEl = document.getElementById('pagination-controls');
    const totalPages = Math.ceil(totalEvents / eventsPerPage);
    
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Botón anterior
    paginationHTML += `
        <button class="pagination-btn" onclick="loadEventos(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            ← Anterior
        </button>
    `;
    
    // Información de página
    paginationHTML += `
        <span class="pagination-info">
            Página ${currentPage} de ${totalPages} (${totalEvents} eventos)
        </span>
    `;
    
    // Botón siguiente
    paginationHTML += `
        <button class="pagination-btn" onclick="loadEventos(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Siguiente →
        </button>
    `;
    
    paginationEl.innerHTML = paginationHTML;
}

// ========== ESCÁNER QR ==========

function iniciarMonitoreoEvento(eventoId) {
    // Verificar cada 60 segundos si el evento sigue activo
    eventoTimer = setInterval(async () => {
        const { data: evento } = await tursodb
            .from('eventos')
            .select('fecha_inicio, fecha_fin, hora_inicio, hora_fin')
            .eq('id', eventoId)
            .single();
        
        if (!evento) return;
        
        const ahora = new Date();
        const year = ahora.getFullYear();
        const month = String(ahora.getMonth() + 1).padStart(2, '0');
        const day = String(ahora.getDate()).padStart(2, '0');
        const fechaActual = `${year}-${month}-${day}`;
        const horaActual = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');
        const horaFin = evento.hora_fin.substring(0, 5);
        
        // Agregar 10 minutos de tolerancia
        const [horaFinH, horaFinM] = horaFin.split(':').map(Number);
        let minutosFinales = horaFinM + 10;
        let horasFinales = horaFinH;
        
        if (minutosFinales >= 60) {
            horasFinales += 1;
            minutosFinales -= 60;
        }
        
        const horaFinConTolerancia = horasFinales.toString().padStart(2, '0') + ':' + minutosFinales.toString().padStart(2, '0');
        
        // Verificar si ya pasó el tiempo (con tolerancia)
        if (fechaActual > evento.fecha_fin || (fechaActual === evento.fecha_fin && horaActual > horaFinConTolerancia)) {
            clearInterval(eventoTimer);
            alert('⏰ El periodo del evento ha finalizado. Redirigiendo al módulo...');
            showAsistenciaModule();
        }
    }, 60000); // Cada 60 segundos
}

async function validarEventoActivo(eventoId) {
    const { data: evento } = await tursodb
        .from('eventos')
        .select('fecha_inicio, fecha_fin, hora_inicio, hora_fin')
        .eq('id', eventoId)
        .single();
    
    if (!evento) return false;
    
    const ahora = new Date();
    const year = ahora.getFullYear();
    const month = String(ahora.getMonth() + 1).padStart(2, '0');
    const day = String(ahora.getDate()).padStart(2, '0');
    const fechaActual = `${year}-${month}-${day}`;
    const horaActual = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');
    
    // Validar fecha
    if (fechaActual < evento.fecha_inicio || fechaActual > evento.fecha_fin) {
        alert(`⚠️ Este evento solo está activo entre ${evento.fecha_inicio} y ${evento.fecha_fin}\nFecha actual: ${fechaActual}`);
        showAsistenciaModule();
        return false;
    }
    
    // Extraer solo HH:MM de las horas del evento (quitar segundos)
    const horaInicio = evento.hora_inicio.substring(0, 5);
    const horaFin = evento.hora_fin.substring(0, 5);
    
    // Validar hora
    if (horaActual < horaInicio || horaActual > horaFin) {
        alert(`⚠️ Este evento solo registra asistencias entre ${horaInicio} y ${horaFin}\nHora actual: ${horaActual}`);
        showAsistenciaModule();
        return false;
    }
    
    return true;
}

function startScanner() {
    // Resetear flag de primer escaneo
    isFirstScan = true;
    
    // Configurar eventos de los botones
    document.getElementById('btn-camera').onclick = startCameraScanner;
    document.getElementById('btn-file').onclick = showFileUpload;
    const btnFlash = document.getElementById('btn-flash');
    if (btnFlash) {
        btnFlash.onclick = toggleFlash;
        btnFlash.className = 'btn-secondary';
        btnFlash.textContent = '⚡ Flash';
    }
    isFlashOn = false;
    
    // Configurar botón de procesar imagen
    const btnProcessImage = document.getElementById('btn-process-image');
    if (btnProcessImage) {
        btnProcessImage.onclick = processSelectedImage;
    }
    
    // ESTADO INICIAL: TODO OCULTO
    const scannerContainer = document.getElementById('scanner-container');
    const photoTools = document.getElementById('photo-tools');
    
    // Ocultar todo al inicio usando clases CSS
    if (scannerContainer) {
        scannerContainer.innerHTML = '';
        scannerContainer.style.display = 'none';
    }
    if (photoTools) {
        photoTools.classList.remove('show');
        photoTools.classList.add('hide');
    }
    
    // Asegurar que no hay cámara activa
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
        html5QrCode = null;
    }
    
    // Botones en estado inicial (ambos inactivos)
    const btnCamera = document.getElementById('btn-camera');
    const btnFile = document.getElementById('btn-file');
    if (btnCamera) {
        btnCamera.className = 'btn-secondary';
        btnCamera.textContent = '📷 Cámara';
    }
    if (btnFile) {
        btnFile.className = 'btn-secondary';
        btnFile.textContent = '📁 Cargar Foto';
    }
    
    console.log('🚀 Escáner iniciado - Estado limpio, esperando selección del usuario');
}



function startCameraScanner() {
    console.log('📷 === INICIANDO MODO CÁMARA ===');
    
    const scannerContainer = document.getElementById('scanner-container');
    const photoTools = document.getElementById('photo-tools');
    const btnFlash = document.getElementById('btn-flash');
    if (btnFlash) {
        btnFlash.className = 'btn-secondary';
        btnFlash.textContent = '⚡ Flash';
    }
    isFlashOn = false;
    
    // PASO 1: Detener cámara anterior si existe
    if (html5QrCode) {
        console.log('🛑 Deteniendo cámara anterior...');
        if (html5QrCode.isScanning) {
            html5QrCode.stop().catch(console.error);
        }
        html5QrCode = null;
        console.log('✅ Cámara anterior limpiada');
    }
    
    // PASO 2: Ocultar herramientas de foto usando clase CSS
    if (photoTools) {
        photoTools.classList.remove('show');
        photoTools.classList.add('hide');
        console.log('🙈 Herramientas de foto ocultas con clase .hide');
    }
    
    // PASO 3: Preparar área de cámara
    if (scannerContainer) {
        scannerContainer.innerHTML = '<div id="camera-reader" style="width: 100%; max-width: 500px; margin: 0 auto; min-height: 300px; background: #000; border-radius: 8px;"></div>';
        scannerContainer.style.display = 'block';
        console.log('📺 Área de cámara preparada');
    }
    
    // PASO 4: Actualizar botones
    const btnCamera = document.getElementById('btn-camera');
    const btnFile = document.getElementById('btn-file');
    if (btnCamera) {
        btnCamera.className = 'btn-primary';
        btnCamera.textContent = '📷 Cámara Activa';
    }
    if (btnFile) {
        btnFile.className = 'btn-secondary';
        btnFile.textContent = '📁 Cargar Foto';
    }
    
    // PASO 5: Inicializar cámara con delay
    setTimeout(() => {
        console.log('🚀 Inicializando nueva cámara...');
        
        // Verificar que el elemento existe
        const cameraReader = document.getElementById('camera-reader');
        if (!cameraReader) {
            console.error('❌ Elemento camera-reader no encontrado');
            return;
        }
        
        // Crear nueva instancia de Html5Qrcode
        html5QrCode = new Html5Qrcode("camera-reader");
        
        // Configurar y iniciar cámara
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 }
        };
        
        html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            (errorMessage) => {
                // Silenciar errores de escaneo normales
            }
        ).then(() => {
            console.log('✅ Cámara iniciada correctamente');
        }).catch(err => {
            console.error('❌ Error iniciando cámara:', err);
            if (cameraReader) {
                cameraReader.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #dc3545; background: #f8d7da; border-radius: 8px;">
                        <h4>❌ Error de Cámara</h4>
                        <p>No se pudo acceder a la cámara.</p>
                        <small>Verifica los permisos del navegador</small>
                    </div>
                `;
            }
        });
    }, 300);
}



function showFileUpload() {
    console.log('📁 === INICIANDO MODO CARGAR FOTO ===');
    
    const scannerContainer = document.getElementById('scanner-container');
    const photoTools = document.getElementById('photo-tools');
    const btnFlash = document.getElementById('btn-flash');
    if (btnFlash) {
        btnFlash.className = 'btn-secondary';
        btnFlash.textContent = '⚡ Flash';
    }
    isFlashOn = false;
    
    // PASO 1: Detener y limpiar cámara
    if (html5QrCode) {
        console.log('🛑 Deteniendo cámara...');
        if (html5QrCode.isScanning) {
            html5QrCode.stop().catch(console.error);
        }
        html5QrCode = null;
        console.log('✅ Cámara detenida y limpiada');
    }
    
    // PASO 2: Ocultar área de cámara
    if (scannerContainer) {
        scannerContainer.innerHTML = '';
        scannerContainer.style.display = 'none';
        console.log('🙈 Área de cámara oculta');
    }
    
    // PASO 3: Mostrar herramientas de foto usando clase CSS
    if (photoTools) {
        photoTools.classList.remove('hide');
        photoTools.classList.add('show');
        console.log('📱 Herramientas de foto mostradas con clase .show');
    }
    
    // PASO 4: Actualizar botones
    const btnCamera = document.getElementById('btn-camera');
    const btnFile = document.getElementById('btn-file');
    if (btnCamera) {
        btnCamera.className = 'btn-secondary';
        btnCamera.textContent = '📷 Cámara';
    }
    if (btnFile) {
        btnFile.className = 'btn-primary';
        btnFile.textContent = '📁 Cargar Foto Activo';
    }
    
    // PASO 5: Configurar botón de procesar
    const btnProcessImage = document.getElementById('btn-process-image');
    if (btnProcessImage) {
        btnProcessImage.onclick = processSelectedImage;
    }
    
    // PASO 6: Limpiar input de archivo
    const fileInput = document.getElementById('qr-file-input');
    if (fileInput) {
        fileInput.value = '';
    }
    
    console.log('📁 Modo CARGAR FOTO activado');
}

async function toggleFlash() {
    if (!html5QrCode || !html5QrCode.isScanning) {
        alert('Primero debes activar la cámara haciendo clic en "📷 Cámara".');
        return;
    }

    const btnFlash = document.getElementById('btn-flash');
    const targetState = !isFlashOn;

    try {
        if (typeof html5QrCode.applyVideoConstraints === 'function') {
            await html5QrCode.applyVideoConstraints({
                advanced: [{ torch: targetState }]
            });
            isFlashOn = targetState;
        } else {
            const videoElement = document.querySelector('#camera-reader video');
            if (videoElement && videoElement.srcObject) {
                const track = videoElement.srcObject.getVideoTracks()[0];
                if (track) {
                    await track.applyConstraints({
                        advanced: [{ torch: targetState }]
                    });
                    isFlashOn = targetState;
                } else {
                    throw new Error('No se encontró la pista de video');
                }
            } else {
                throw new Error('No se encontró el elemento de video');
            }
        }

        if (btnFlash) {
            btnFlash.textContent = isFlashOn ? '⚡ Flash ON' : '⚡ Flash';
            btnFlash.className = isFlashOn ? 'btn-warning' : 'btn-secondary';
        }
    } catch (err) {
        console.error('❌ Error al alternar linterna/flash:', err);
        alert('⚡ No se pudo activar el flash. Es posible que esta cámara o dispositivo no lo soporte.');
    }
}

function processSelectedImage() {
    const fileInput = document.getElementById('qr-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Selecciona primero una imagen');
        return;
    }
    
    console.log('📁 Procesando imagen:', file.name);
    console.log('📊 Estado antes de procesar - isScanning:', isScanning);
    
    // Resetear isScanning para permitir el procesamiento
    if (isScanning) {
        console.log('⚠️ isScanning estaba en true, reseteando a false');
        isScanning = false;
    }
    
    // Mostrar mensaje de procesamiento
    showMessage('Procesando imagen...', 'info');
    
    // Crear un elemento temporal para el escáner de archivos
    const tempScannerId = 'temp-file-scanner-' + Date.now();
    const tempDiv = document.createElement('div');
    tempDiv.id = tempScannerId;
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    
    // Crear instancia temporal de Html5Qrcode
    const fileScanner = new Html5Qrcode(tempScannerId);
    
    // Escanear el archivo
    fileScanner.scanFile(file, true)
        .then(decodedText => {
            console.log('✅ QR decodificado desde archivo:', decodedText);
            // Limpiar el escáner temporal
            document.body.removeChild(tempDiv);
            // Procesar el resultado directamente
            onScanSuccess(decodedText, null);
        })
        .catch(err => {
            console.error('❌ Error escaneando archivo:', err);
            // Limpiar el escáner temporal
            document.body.removeChild(tempDiv);
            showMessage('No se pudo leer el código QR de la imagen', 'error');
            alert('❌ No se pudo leer el código QR de la imagen. Verifica que la imagen contenga un código QR válido.');
        });
    
    // Limpiar input después de procesar
    fileInput.value = '';
}

async function onScanSuccess(qrData, decodedResult) {
    console.log('🔍 onScanSuccess llamado con:', qrData);
    console.log('📊 Estado actual - isScanning:', isScanning, 'isFirstScan:', isFirstScan);
    
    if (isScanning) {
        console.log('⏸️ Escaneo ya en progreso, ignorando...');
        return;
    }
    isScanning = true;

    // Prevenir cualquier comportamiento por defecto
    try {
        if (window.event) {
            console.log('🛑 Previniendo evento por defecto');
            window.event.preventDefault();
            window.event.stopPropagation();
        }
    } catch (e) {
        console.log('⚠️ Error previniendo evento:', e.message);
    }
    
    // Si es el primer escaneo, agregar un delay adicional
    if (isFirstScan) {
        isFirstScan = false;
        console.log('🔥 Primer escaneo detectado, inicializando...');
        // Pequeño delay para estabilizar el sistema
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('✅ Delay de estabilización completado');
    }

    try {
        // Extraer código único del QR (último campo después del |)
        const qrParts = qrData.split('|');
        const codigoUnico = qrParts[qrParts.length - 1]; // Último elemento
        
        // Buscar primero en cache local
        let estudiante = findEstudianteInCache(codigoUnico);
        
        // Si no está en cache, buscar en BD con timeout de 3s
        if (!estudiante) {
            try {
                const { data, error } = await Promise.race([
                    tursodb.from('estudiantes').select('*').eq('codigo_unico', codigoUnico).maybeSingle(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]);
                
                if (!error && data) {
                    estudiante = data;
                }
            } catch (networkError) {
                console.log('Conexión lenta/sin conexión, usando cache local');
            }
        }

        // Si no es estudiante, buscar en personal administrativo
        let personal = null;
        if (!estudiante) {
            try {
                const result = await Promise.race([
                    tursodb.query('SELECT * FROM administrativos WHERE codigo_unico = ?', [codigoUnico]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]);
                
                if (result && result.rows && result.rows.length > 0) {
                    personal = result.rows[0];
                }
            } catch (networkError) {
                console.log('Conexión lenta/sin conexión para personal');
            }
        }

        if (!estudiante && !personal) {
            showBigAlert('Código no encontrado', 'error', 'Este código QR no corresponde a ningún estudiante registrado');
            setTimeout(() => { isScanning = false; }, 2000);
            return;
        }

        const persona = estudiante || personal;
        const nombreCompleto = formatearNombreCompleto(persona.nombre, persona.apellido_paterno, persona.apellido_materno);
        const tipoPersona = estudiante ? 'estudiante' : 'personal';
        const personaId = persona.id;

        // VERIFICAR DUPLICADOS EN BD PRIMERO
        try {
            const tabla = estudiante ? 'asistencias' : 'asistencias_personal';
            const campo = estudiante ? 'estudiante_id' : 'personal_id';
            
            const existeEnBD = await Promise.race([
                tursodb.query(`SELECT id FROM ${tabla} WHERE ${campo} = ? AND evento_id = ?`, [personaId, currentEventId]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
            
            if (existeEnBD && existeEnBD.rows && existeEnBD.rows.length > 0) {
                showBigAlert(nombreCompleto, 'warning', 'YA REGISTRADO\n\nEsta persona ya tiene su asistencia registrada');
                setTimeout(() => { isScanning = false; }, 2000);
                return;
            }
        } catch (error) {
            console.log('No se pudo verificar en BD, verificando en cola offline...');
        }

        // Verificar duplicados en cola offline
        const existeOffline = offlineQueue.find(a => 
            a.persona_id === personaId && a.evento_id === currentEventId && a.tipo === tipoPersona
        );
        
        if (existeOffline) {
            showBigAlert(nombreCompleto, 'warning', 'YA REGISTRADO\n\nEsta persona ya tiene su asistencia guardada (pendiente de sincronizar)');
            setTimeout(() => { isScanning = false; }, 2000);
            return;
        }

        // Intentar guardar online con timeout de 3s
        let guardadoOnline = false;
        try {
            const tabla = estudiante ? 'asistencias' : 'asistencias_personal';
            const campo = estudiante ? 'estudiante_id' : 'personal_id';
            
            const { error: insertError } = await Promise.race([
                tursodb.query(`INSERT INTO ${tabla} (id, ${campo}, evento_id, timestamp) VALUES (?, ?, ?, ?)`, [Date.now().toString(), personaId, currentEventId, new Date().toISOString()]),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);

            if (!insertError) {
                guardadoOnline = true;
                showBigAlert(nombreCompleto, 'success', 'ASISTENCIA REGISTRADA\n\nRegistro guardado correctamente en el sistema');
                setTimeout(() => loadAsistencias(currentEventId), 1000);
            }
        } catch (networkError) {
            console.log('Conexión lenta, activando modo offline');
            activarModoOffline();
        }
        
        // Si falló online, guardar offline
        if (!guardadoOnline) {
            const agregado = addToOfflineQueue(personaId, currentEventId, null, tipoPersona);
            if (agregado) {
                showBigAlert(nombreCompleto, 'success', 'ASISTENCIA GUARDADA\n\nRegistro guardado localmente\n(Se sincronizará cuando haya conexión)');
                addToLocalAsistenciasList(persona, tipoPersona);
            } else {
                showBigAlert(nombreCompleto, 'warning', 'YA REGISTRADO\n\nEsta persona ya tiene su asistencia guardada');
            }
        }
        
        setTimeout(() => { 
            console.log('⏰ Liberando isScanning después de 5 segundos');
            isScanning = false;
        }, 2000); // 2 segundos de delay entre escaneos

    } catch (error) {
        console.error('❌ Error general en onScanSuccess:', error);
        showBigAlert('Error del sistema', 'error', 'Ocurrió un error inesperado');
        setTimeout(() => { 
            console.log('❌ Liberando isScanning por error');
            isScanning = false; 
        }, 2000);
    }
    
    console.log('🏁 onScanSuccess terminado');
}

// Activar modo offline manual
function activarModoOffline() {
    isAdaptiveOfflineMode = true;
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.style.display = 'block';
        indicator.textContent = '📱 Modo Offline (Conexión lenta)';
        indicator.className = 'offline-indicator adaptive';
    }
    console.log('🔄 Modo offline activado por conexión lenta');
    
    // Verificar conexión cada 10 segundos
    setTimeout(verificarConexion, 10000);
}

// Verificar si la conexión se restableció
async function verificarConexion() {
    if (!isAdaptiveOfflineMode) return;
    
    try {
        const testResult = await Promise.race([
            tursodb.query('SELECT 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]);
        
        if (testResult && !testResult.error) {
            // Conexión restablecida
            isAdaptiveOfflineMode = false;
            const indicator = document.getElementById('offline-indicator');
            if (indicator && offlineQueue.length === 0) {
                indicator.style.display = 'none';
            }
            console.log('✅ Conexión restablecida, volviendo a modo online');
            
            // Intentar sincronizar automáticamente
            if (offlineQueue.length > 0) {
                await syncOfflineQueue();
            }
        } else {
            // Aún sin conexión, verificar de nuevo en 10s
            setTimeout(verificarConexion, 10000);
        }
    } catch (error) {
        // Aún sin conexión, verificar de nuevo en 10s
        setTimeout(verificarConexion, 10000);
    }
}

// ========== ASISTENCIAS ==========

async function loadAsistencias(eventoId) {
    console.log('Cargando asistencias para evento:', eventoId);
    const listEl = document.getElementById('asistencias-list');
    
    const [resultEst, resultPer] = await Promise.all([
        tursodb.query(`
            SELECT a.timestamp, e.nombre, e.apellido_paterno, e.apellido_materno, e.codigo_unico, e.dni, e.especialidad AS categoria, e.anio_formacion AS subcategoria
            FROM asistencias a
            JOIN estudiantes e ON a.estudiante_id = e.id
            WHERE a.evento_id = ?
            ORDER BY a.timestamp DESC
        `, [eventoId]),
        tursodb.query(`
            SELECT a.timestamp, p.nombre, p.apellido_paterno, p.apellido_materno, p.codigo_unico, p.dni, p.personal AS categoria, p.cargo AS subcategoria
            FROM asistencias_personal a
            JOIN administrativos p ON a.personal_id = p.id
            WHERE a.evento_id = ?
            ORDER BY a.timestamp DESC
        `, [eventoId])
    ]);
    
    const rows = [
        ...(resultEst.rows || []).map(r => ({ ...r, tipo: 'estudiante' })),
        ...(resultPer.rows || []).map(r => ({ ...r, tipo: 'personal' }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (rows.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: #666;">No hay asistencias registradas</p>';
        return;
    }

    listEl.innerHTML = '';
    rows.forEach(asistencia => {
        const item = document.createElement('div');
        item.className = 'asistencia-item';
        const time = new Date(asistencia.timestamp).toLocaleString('es-BO', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour12: false
        });
        const tipoIcon = asistencia.tipo === 'personal' ? '👔' : '🎓';
        const etiqueta = asistencia.tipo === 'personal'
            ? `💼 ${formatearCampoOpcional(asistencia.subcategoria, 'Sin cargo')}`
            : `🎓 ${formatearCampoOpcional(asistencia.categoria, 'Sin especialidad')} | 📅 Año ${formatearCampoOpcional(asistencia.subcategoria, 'N/A')}`;
        item.innerHTML = `
            <div style="width: 100%;">
                <strong style="font-size: 16px; color: #333;">${tipoIcon} ${formatearNombreCompleto(asistencia.nombre, asistencia.apellido_paterno, asistencia.apellido_materno)}</strong><br>
                <small style="color: #666; font-size: 13px;">
                    📋 ${asistencia.codigo_unico} | 
                    🆔 ${formatearCampoOpcional(asistencia.dni, 'Sin DNI')} | 
                    ${etiqueta}
                </small>
            </div>
            <span style="color: #007bff; font-weight: bold;">${time}</span>
        `;
        listEl.appendChild(item);
    });
}

// Agregar asistencia a lista local (para mostrar inmediatamente)
function addToLocalAsistenciasList(persona, tipo = 'estudiante') {
    const listEl = document.getElementById('asistencias-list');
    if (!listEl) return;
    
    const item = document.createElement('div');
    item.className = 'asistencia-item offline-item';
    const time = new Date().toLocaleString('es-BO', { 
        hour: '2-digit', 
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour12: false
    });
    
    const tipoIcon = tipo === 'estudiante' ? '🎓' : '👔';
    const especialidadOCargo = tipo === 'estudiante' ? persona.especialidad : persona.cargo;
    const anioOTipo = tipo === 'estudiante' ? persona.anio_formacion : persona.personal;
    
    item.innerHTML = `
        <div style="width: 100%;">
            <strong style="font-size: 16px; color: #333;">${tipoIcon} ${formatearNombreCompleto(persona.nombre, persona.apellido_paterno, persona.apellido_materno)}</strong><br>
            <small style="color: #666; font-size: 13px;">
                📋 ${persona.codigo_unico} | 
                🆔 ${formatearCampoOpcional(persona.dni, 'Sin DNI')} | 
                ${tipo === 'estudiante' ? '🎓' : '💼'} ${formatearCampoOpcional(especialidadOCargo, 'Sin especialidad')} | 
                📅 ${formatearCampoOpcional(anioOTipo, 'N/A')}
            </small>
        </div>
        <span style="color: #ff9800; font-weight: bold;">📱 ${time}</span>
    `;
    
    // Insertar al inicio de la lista
    listEl.insertBefore(item, listEl.firstChild);
}



function formatearCampoOpcional(valor, valorPorDefecto = '') {
    if (!valor || valor === 'SIN DATO' || valor === 'Sin DNI' || valor === 'Sin celular' || valor === 'Sin email' || valor === 'N/A') {
        return valorPorDefecto;
    }
    return valor;
}

function formatearNombreCompleto(nombre, apellidoPaterno, apellidoMaterno) {
    // Solo ocultar si es exactamente "SIN DATO", no otros valores falsy
    const apellidoMaternoFormateado = (apellidoMaterno && apellidoMaterno !== 'SIN DATO') ? apellidoMaterno : '';
    return `${nombre} ${apellidoPaterno}${apellidoMaternoFormateado ? ' ' + apellidoMaternoFormateado : ''}`;
}

function showMessage(text, type) {
    const msgEl = document.getElementById('mensaje');
    msgEl.textContent = text;
    msgEl.className = type;
    setTimeout(() => {
        msgEl.textContent = '';
        msgEl.className = '';
    }, 3000);
}

// Mostrar aviso emergente grande en toda la pantalla
function showBigAlert(nombre, tipo, mensaje) {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Crear contenido del aviso
    const alertBox = document.createElement('div');
    const bgColor = tipo === 'success' ? '#28a745' : tipo === 'warning' ? '#ffc107' : '#dc3545';
    const textColor = tipo === 'warning' ? '#000' : '#fff';
    
    alertBox.style.cssText = `
        background: ${bgColor};
        color: ${textColor};
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        max-width: 90%;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    `;
    
    alertBox.innerHTML = `
        <div style="font-size: 4rem; margin-bottom: 20px;">
            ${tipo === 'success' ? '✅' : tipo === 'warning' ? '⚠️' : '❌'}
        </div>
        <h2 style="font-size: 2rem; margin-bottom: 15px; font-weight: bold;">
            ${nombre}
        </h2>
        <p style="font-size: 1.5rem; margin: 0;">
            ${mensaje}
        </p>
    `;
    
    overlay.appendChild(alertBox);
    document.body.appendChild(overlay);
    
    // Auto-cerrar después de 3 segundos
    setTimeout(() => {
        document.body.removeChild(overlay);
    }, 3000);
    
    // Cerrar al hacer clic
    overlay.addEventListener('click', () => {
        document.body.removeChild(overlay);
    });
}

// ========== GESTIÓN DE ESTUDIANTES ==========

async function loadEstudiantes() {
    hideAllSections();
    document.getElementById('estudiantes-section').classList.add('active');
    
    const container = document.getElementById('especialidades-accordion');
    container.innerHTML = '<p style="color: white;">Cargando...</p>';

    const result = await tursodb.query(`SELECT * FROM estudiantes ORDER BY especialidad, anio_formacion, codigo_unico`);
    
    console.log('Total estudiantes encontrados:', result.rows?.length || 0);
    
    if (!result.rows || result.rows.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay estudiantes. Usa la carga masiva para importar desde Excel.</p>';
        return;
    }

    const data = result.rows;
    
    // Ordenar en JavaScript
    data.sort((a, b) => {
        if (a.especialidad !== b.especialidad) {
            return a.especialidad.localeCompare(b.especialidad);
        }
        if (a.anio_formacion !== b.anio_formacion) {
            const orden = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
            return orden.indexOf(a.anio_formacion) - orden.indexOf(b.anio_formacion);
        }
        return a.codigo_unico.localeCompare(b.codigo_unico);
    });

    const grouped = {};
    data.forEach(est => {
        const esp = est.especialidad || 'Sin Especialidad';
        const anio = est.anio_formacion || 'Sin Año';
        if (!grouped[esp]) grouped[esp] = {};
        if (!grouped[esp][anio]) grouped[esp][anio] = [];
        grouped[esp][anio].push(est);
    });

    // Limpiar completamente el contenedor antes de agregar nuevo contenido
    container.innerHTML = '';
    
    Object.keys(grouped).sort().forEach(especialidad => {
        const accordion = document.createElement('div');
        accordion.className = 'accordion';
        
        const totalEst = Object.values(grouped[especialidad]).flat().length;
        const espId = especialidad.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        
        accordion.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <span>🎓 ${especialidad} (${totalEst} estudiantes)</span>
                <span>▼</span>
            </div>
            <div class="accordion-content">
                <div id="anios-${espId}"></div>
            </div>
        `;
        container.appendChild(accordion);

        const aniosContainer = accordion.querySelector(`#anios-${espId}`);
        Object.keys(grouped[especialidad]).sort((a, b) => {
            const orden = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
            return orden.indexOf(a) - orden.indexOf(b);
        }).forEach(anio => {
            const subAccordion = document.createElement('div');
            subAccordion.className = 'sub-accordion';
            
            const estudiantes = grouped[especialidad][anio];
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'sub-accordion-header';
            headerDiv.onclick = function() { toggleSubAccordion(this); };
            
            headerDiv.innerHTML = `
                <span>📅 Año ${anio} (${estudiantes.length} estudiantes)</span>
                <div>
                    <button class="btn-success" style="padding: 5px 10px; font-size: 12px;">📥 QRs</button>
                    <span style="margin-left: 10px;">▼</span>
                </div>
            `;
            
            const btnQRs = headerDiv.querySelector('.btn-success');
            btnQRs.onclick = function(e) {
                e.stopPropagation();
                generarQRsGrupoDirecto(especialidad, anio);
            };
            
            subAccordion.appendChild(headerDiv);
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'sub-accordion-content';
            contentDiv.innerHTML = estudiantes.map(est => `
                <div class="estudiante-item">
                    <div>
                        <strong>${formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno)}</strong><br>
                        <small>📋 ${est.codigo_unico} | 🆔 ${formatearCampoOpcional(est.dni, 'Sin DNI')} | 📱 ${formatearCampoOpcional(est.celular, 'Sin celular')}</small>
                    </div>
                </div>
            `).join('');
            
            subAccordion.appendChild(contentDiv);
            aniosContainer.appendChild(subAccordion);
        });
    });
}

function toggleAccordion(element) {
    const content = element.nextElementSibling;
    content.classList.toggle('active');
    const arrow = element.querySelector('span:last-child');
    arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
}

function toggleSubAccordion(element) {
    const content = element.nextElementSibling;
    content.classList.toggle('active');
    const arrow = element.querySelector('span:last-child');
    arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
}

function showCrearEspecialidad() {
    hideAllSections();
    document.getElementById('crear-especialidad-section').classList.add('active');
    updateAllUserDropdowns();
}

function crearEspecialidadAnio() {
    const especialidad = document.getElementById('nueva-especialidad').value;
    const anio = document.getElementById('nuevo-anio').value;
    
    if (!especialidad || !anio) {
        alert('Completa todos los campos');
        return;
    }
    
    currentEspecialidad = especialidad;
    currentAnio = parseInt(anio);
    showAgregarEstudiante();
}

function agregarEstudianteA(especialidad, anio) {
    currentEspecialidad = especialidad;
    currentAnio = anio;
    showAgregarEstudiante();
    
    // Actualizar botón volver según origen
    setTimeout(() => {
        const volverBtn = document.querySelector('#agregar-estudiante-section .header-right button');
        if (volverBtn) {
            if (origenGestion === 'gestion') {
                volverBtn.onclick = () => showGestionEstudiantesCompleto();
            } else {
                volverBtn.onclick = () => showListaEstudiantes();
            }
        }
    }, 100);
}

function showListaEstudiantes() {
    loadEstudiantes();
}

function showAgregarEstudiante() {
    hideAllSections();
    document.getElementById('agregar-estudiante-section').classList.add('active');
    updateAllUserDropdowns();
    document.getElementById('form-especialidad').textContent = currentEspecialidad;
    document.getElementById('form-anio').textContent = currentAnio;
}

async function agregarEstudiante() {
    const codigo = document.getElementById('est-codigo').value;
    const dni = document.getElementById('est-dni').value;
    const nombre = document.getElementById('est-nombre').value;
    const apellidoPaterno = document.getElementById('est-apellido-paterno').value;
    const apellidoMaterno = document.getElementById('est-apellido-materno').value;
    const celular = document.getElementById('est-celular').value;
    const email = document.getElementById('est-email').value;
    const password = document.getElementById('est-password').value;

    if (!codigo || !dni || !nombre || !apellidoPaterno || !apellidoMaterno || !password) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    const { error } = await tursodb.from('estudiantes').insert({
        codigo_unico: codigo,
        dni: dni,
        nombre,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        celular: celular || null,
        email: email || null,
        password: password,
        especialidad: currentEspecialidad,
        anio_formacion: currentAnio
    });

    if (error) {
        alert('Error: ' + error.message);
        return;
    }

    document.getElementById('est-codigo').value = '';
    document.getElementById('est-dni').value = '';
    document.getElementById('est-nombre').value = '';
    document.getElementById('est-apellido-paterno').value = '';
    document.getElementById('est-apellido-materno').value = '';
    document.getElementById('est-celular').value = '';
    document.getElementById('est-email').value = '';
    document.getElementById('est-password').value = 'estudiante123';

    alert('✓ Estudiante agregado correctamente');
    showListaEstudiantes();
}

async function actualizarEstudiante() {
    const id = document.getElementById('edit-est-id').value;
    const codigo = document.getElementById('edit-est-codigo').value;
    const dni = document.getElementById('edit-est-dni').value;
    const nombre = document.getElementById('edit-est-nombre').value;
    const apellidoPaterno = document.getElementById('edit-est-apellido-paterno').value;
    const apellidoMaterno = document.getElementById('edit-est-apellido-materno').value || 'SIN DATO';
    const celular = document.getElementById('edit-est-celular').value || null;
    const email = document.getElementById('edit-est-email').value || null;
    const password = document.getElementById('edit-est-password').value;

    if (!codigo || !dni || !nombre || !apellidoPaterno || !password) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    try {
        await tursodb.query(`
            UPDATE estudiantes 
            SET codigo_unico = ?, dni = ?, nombre = ?, apellido_paterno = ?, apellido_materno = ?, celular = ?, email = ?, password = ?
            WHERE id = ?
        `, [codigo, dni, nombre, apellidoPaterno, apellidoMaterno, celular, email, password, id]);

        alert('✓ Estudiante actualizado correctamente');
        showGestionEstudiantesCompleto();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function generarQRsGrupo() {
    generarQRsGrupoDirecto(currentEspecialidad, currentAnio);
}

async function generarQRsGrupoDirecto(especialidad, anio) {
    currentEspecialidad = especialidad;
    currentAnio = anio;
    currentTipoPersonal = null; // Limpiar variable de personal
    origenQR = 'estudiantes'; // Marcar origen
    
    hideAllSections();
    document.getElementById('generar-qr-section').classList.add('active');
    updateAllUserDropdowns();
    
    // Actualizar botón volver para estudiantes
    const volverBtn = document.querySelector('#generar-qr-section .header-right button');
    if (volverBtn) {
        volverBtn.onclick = () => showEstudiantes();
    }
    
    const container = document.getElementById('qr-container');
    container.innerHTML = '<p style="color: white;">Generando QRs...</p>';
    qrCodesGenerated = [];

    const { data, error } = await tursodb.from('estudiantes').select('*');
    
    if (error) {
        container.innerHTML = '<p style="color: white;">Error cargando estudiantes</p>';
        console.error('Error cargando estudiantes:', error);
        return;
    }
    
    const estudiantesFiltrados = (data || []).filter(est => 
        est.especialidad === especialidad && est.anio_formacion == anio
    );
    
    estudiantesFiltrados.sort((a, b) => a.codigo_unico.localeCompare(b.codigo_unico));

    if (estudiantesFiltrados.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay estudiantes para esta especialidad y año</p>';
        return;
    }

    // Actualizar el botón de descarga con información contextual
    const headerContainer = document.querySelector('#generar-qr-section .container');
    const btnZip = headerContainer.querySelector('.btn-success');
    if (btnZip) {
        // Crear div de información si no existe
        let infoDiv = headerContainer.querySelector('.qr-info');
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.className = 'qr-info';
            infoDiv.style.cssText = 'background: rgba(255,255,255,0.95); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
            btnZip.parentNode.insertBefore(infoDiv, btnZip.nextSibling);
        }
        infoDiv.innerHTML = `
            <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">
                🎓 ${especialidad}
            </p>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                📅 Año: ${anio} | 👥 Total: ${estudiantesFiltrados.length} estudiantes
            </p>
        `;
    }

    container.innerHTML = '';
    
    estudiantesFiltrados.forEach((est, index) => {
        const qrItem = document.createElement('div');
        qrItem.className = 'qr-item';
        const nombreCompleto = formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno);
        qrItem.innerHTML = `
            <h3>${nombreCompleto}</h3>
            <p><strong>${est.codigo_unico}</strong></p>
            <div class="qr-code" id="qr-${index}"></div>
            <button class="download-btn" onclick="downloadSingleQR('qr-${index}', '${nombreCompleto.replace(/\s+/g, '_')}')">📥 Descargar</button>
        `;
        container.appendChild(qrItem);

        setTimeout(() => {
            const qrElement = document.getElementById(`qr-${index}`);
            if (qrElement && typeof qrcode !== 'undefined') {
                const qrData = `${formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno)}|${est.especialidad}|${est.codigo_unico}`;
                const qr = qrcode(0, 'M'); // Tipo 0 (automático), corrección media
                qr.addData(qrData);
                qr.make();
                
                // Crear imagen SVG
                const size = 120;
                const cellSize = size / qr.getModuleCount();
                
                let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
                svg += `<rect width="${size}" height="${size}" fill="white"/>`;
                
                for (let row = 0; row < qr.getModuleCount(); row++) {
                    for (let col = 0; col < qr.getModuleCount(); col++) {
                        if (qr.isDark(row, col)) {
                            const x = col * cellSize;
                            const y = row * cellSize;
                            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
                        }
                    }
                }
                svg += '</svg>';
                
                qrElement.innerHTML = svg;
            }
        }, index * 100);

        qrCodesGenerated.push({ id: `qr-${index}`, nombre: nombreCompleto.replace(/\s+/g, '_') });
    });
}

function downloadSingleQR(elementId, filename) {
    const svgElement = document.querySelector(`#${elementId} svg`);
    if (!svgElement) return;
    
    // Crear canvas para convertir SVG a PNG - 2.5cm a 300 DPI = 295px
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 295; // 2.5cm a 300 DPI
    
    canvas.width = size;
    canvas.height = size;
    
    // Convertir SVG a imagen
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0, size, size);
        
        // Convertir a blob con metadatos DPI
        canvas.toBlob(function(blob) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Modificar metadatos PNG para 300 DPI
                const modifiedBuffer = setPNGDPI(uint8Array, 300);
                
                const newBlob = new Blob([modifiedBuffer], { type: 'image/png' });
                const link = document.createElement('a');
                link.download = `${filename}.png`;
                link.href = URL.createObjectURL(newBlob);
                link.click();
                URL.revokeObjectURL(link.href);
                URL.revokeObjectURL(url);
            };
            reader.readAsArrayBuffer(blob);
        }, 'image/png', 1.0);
    };
    img.src = url;
}

// Función para establecer DPI en PNG
function setPNGDPI(uint8Array, dpi) {
    const pixelsPerMeter = Math.round(dpi * 39.3701); // Convertir DPI a píxeles por metro
    
    // Crear chunk pHYs (Physical pixel dimensions)
    const pHYsChunk = new Uint8Array(21);
    const view = new DataView(pHYsChunk.buffer);
    
    // Longitud del chunk (9 bytes)
    view.setUint32(0, 9, false);
    
    // Tipo de chunk 'pHYs'
    pHYsChunk[4] = 0x70; // p
    pHYsChunk[5] = 0x48; // H
    pHYsChunk[6] = 0x59; // Y
    pHYsChunk[7] = 0x73; // s
    
    // Píxeles por unidad X (4 bytes)
    view.setUint32(8, pixelsPerMeter, false);
    
    // Píxeles por unidad Y (4 bytes)
    view.setUint32(12, pixelsPerMeter, false);
    
    // Unidad especificador (1 byte) - 1 = metros
    pHYsChunk[16] = 1;
    
    // CRC32 del chunk
    const crc = calculateCRC32(pHYsChunk.slice(4, 17));
    view.setUint32(17, crc, false);
    
    // Insertar el chunk después del IHDR
    const result = new Uint8Array(uint8Array.length + 21);
    result.set(uint8Array.slice(0, 33)); // PNG signature + IHDR
    result.set(pHYsChunk, 33);
    result.set(uint8Array.slice(33), 54);
    
    return result;
}

// Función CRC32 simplificada para PNG
function calculateCRC32(data) {
    const crcTable = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[i] = c;
    }
    
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function downloadAllQRs() {
    if (qrCodesGenerated.length === 0) {
        alert('No hay QRs generados');
        return;
    }
    
    const zip = new JSZip();
    
    // Determinar nombre del ZIP según el contexto
    let nombreZip;
    console.log('📦 Generando ZIP - currentEspecialidad:', currentEspecialidad, 'currentAnio:', currentAnio, 'currentTipoPersonal:', currentTipoPersonal);
    
    if (currentTipoPersonal) {
        // Para personal administrativo (verificar primero)
        const tipoLimpio = currentTipoPersonal.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toUpperCase();
        nombreZip = `QRs_${tipoLimpio}.zip`;
        console.log('📦 ZIP de Personal:', nombreZip);
    } else if (currentEspecialidad && currentAnio) {
        // Para estudiantes
        const especialidadLimpia = currentEspecialidad.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toUpperCase();
        nombreZip = `QRs_${especialidadLimpia}_${currentAnio}.zip`;
        console.log('📦 ZIP de Estudiantes:', nombreZip);
    } else {
        // Fallback genérico
        nombreZip = `QRs_${new Date().toISOString().split('T')[0]}.zip`;
        console.log('📦 ZIP genérico:', nombreZip);
    }
    
    const container = document.getElementById('qr-container');
    
    try {
        // Buscar todos los SVG ANTES de cambiar el contenido
        const allSvg = document.querySelectorAll('#qr-container svg');
        console.log('SVG encontrados:', allSvg.length);
        
        if (allSvg.length === 0) {
            throw new Error('No se encontraron códigos QR. Genera los QRs primero.');
        }
        
        // Crear elemento de progreso sin eliminar el contenido existente
        const progressDiv = document.createElement('div');
        progressDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 10px; z-index: 9999;';
        progressDiv.textContent = '📦 Preparando descarga...';
        document.body.appendChild(progressDiv);
        
        let archivosAgregados = 0;
        
        // Procesar cada SVG
        for (let i = 0; i < allSvg.length; i++) {
            const svgElement = allSvg[i];
            
            try {
                // Obtener el nombre del estudiante del elemento padre
                const qrItem = svgElement.closest('.qr-item');
                const nombreElement = qrItem ? qrItem.querySelector('h3') : null;
                const nombreCompleto = nombreElement ? nombreElement.textContent.trim() : `Estudiante_${i + 1}`;
                const nombreArchivo = nombreCompleto.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
                
                // Crear canvas para convertir SVG a PNG - 2.5cm a 300 DPI = 295px
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const size = 295; // 2.5cm a 300 DPI
                
                canvas.width = size;
                canvas.height = size;
                
                // Convertir SVG a imagen
                const svgData = new XMLSerializer().serializeToString(svgElement);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = () => {
                        ctx.drawImage(img, 0, 0, size, size);
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    img.onerror = reject;
                    img.src = url;
                });
                
                // Convertir canvas a blob con metadatos DPI
                const blob = await new Promise(resolve => {
                    canvas.toBlob(function(originalBlob) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            const arrayBuffer = e.target.result;
                            const uint8Array = new Uint8Array(arrayBuffer);
                            
                            // Modificar metadatos PNG para 300 DPI
                            const modifiedBuffer = setPNGDPI(uint8Array, 300);
                            const newBlob = new Blob([modifiedBuffer], { type: 'image/png' });
                            resolve(newBlob);
                        };
                        reader.readAsArrayBuffer(originalBlob);
                    }, 'image/png', 1.0);
                });
                
                if (blob && blob.size > 100) {
                    zip.file(`${nombreArchivo}.png`, blob);
                    archivosAgregados++;
                    console.log(`QR agregado: ${nombreArchivo}`);
                }
            } catch (err) {
                console.warn(`Error procesando SVG ${i}:`, err);
            }
            
            const progreso = Math.round(((i + 1) / allSvg.length) * 100);
            progressDiv.textContent = `📦 Procesando... ${progreso}%`;
        }
        
        if (archivosAgregados === 0) {
            throw new Error('No se pudieron procesar los códigos QR.');
        }
        
        progressDiv.textContent = '💾 Creando ZIP...';
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        progressDiv.textContent = '⬇️ Descargando...';
        
        // Descargar
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nombreZip;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Remover progreso
        document.body.removeChild(progressDiv);
        
        alert(`✅ Descarga completada\n📁 ${nombreZip}\n📊 ${archivosAgregados} QRs incluidos`);
        
    } catch (error) {
        console.error('Error:', error);
        // Remover progreso si existe
        const progressDiv = document.querySelector('div[style*="position: fixed"]');
        if (progressDiv) document.body.removeChild(progressDiv);
        alert(`❌ ${error.message}`);
    }
}
// ========== GESTIÓN DE EVENTOS AVANZADA ==========

async function editarEvento(eventoId) {
    try {
        const result = await tursodb.query('SELECT * FROM eventos WHERE id = ?', [eventoId]);
        
        if (!result.rows || result.rows.length === 0) {
            alert('Evento no encontrado');
            return;
        }
        
        const evento = result.rows[0];
        
        hideAllSections();
        document.getElementById('editar-evento-section').classList.add('active');
        updateAllUserDropdowns();
        
        document.getElementById('edit-evento-id').value = evento.id;
        document.getElementById('edit-evento-nombre').value = evento.nombre;
        document.getElementById('edit-evento-fecha').value = evento.fecha_inicio.split('T')[0];
        document.getElementById('edit-evento-hora-inicio').value = evento.hora_inicio;
        document.getElementById('edit-evento-hora-fin').value = evento.hora_fin;
    } catch (error) {
        alert('Error cargando evento: ' + error.message);
    }
}

async function actualizarEvento() {
    const id = document.getElementById('edit-evento-id').value;
    const nombre = document.getElementById('edit-evento-nombre').value;
    const fecha = document.getElementById('edit-evento-fecha').value;
    const horaInicio = document.getElementById('edit-evento-hora-inicio').value;
    const horaFin = document.getElementById('edit-evento-hora-fin').value;

    if (!nombre || !fecha || !horaInicio || !horaFin) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    if (horaFin <= horaInicio) {
        alert('La hora fin debe ser posterior a la hora inicio');
        return;
    }

    try {
        await tursodb.query(`
            UPDATE eventos 
            SET nombre = ?, fecha_inicio = ?, fecha_fin = ?, hora_inicio = ?, hora_fin = ?
            WHERE id = ?
        `, [nombre, fecha, fecha, horaInicio, horaFin, id]); // Usar la misma fecha para inicio y fin

        alert('✓ Evento actualizado correctamente');
        showAsistenciaModule();
    } catch (error) {
        alert('Error actualizando evento: ' + error.message);
    }
}

async function eliminarEvento(eventoId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este evento? Esta acción no se puede deshacer.')) {
        return;
    }
    
    try {
        // Verificar que no tenga asistencias
        const { data: asistencias } = await tursodb.query(`
            SELECT COUNT(*) as total FROM asistencias WHERE evento_id = ?
        `, [eventoId]);
        
        if (asistencias && asistencias[0] && asistencias[0].total > 0) {
            alert('No se puede eliminar un evento que tiene asistencias registradas.');
            return;
        }
        
        // Eliminar evento
        await tursodb.query(`DELETE FROM eventos WHERE id = ?`, [eventoId]);
        
        alert('Evento eliminado correctamente.');
        loadEventos(currentPage);
    } catch (error) {
        console.error('Error eliminando evento:', error);
        alert('Error al eliminar el evento.');
    }
}

async function verListaAsistencias(eventoId, eventoNombre) {
    currentEventoId = eventoId;
    currentEventoNombre = eventoNombre;
    
    hideAllSections();
    document.getElementById('ver-asistencias-section').classList.add('active');
    updateAllUserDropdowns();
    document.getElementById('asistencias-evento-title').textContent = `Asistencias - ${eventoNombre}`;
    
    const listEl = document.getElementById('asistencias-completas-list');
    listEl.innerHTML = '<p>Limpiando duplicados y cargando asistencias...</p>';
    
    try {
        // LIMPIAR DUPLICADOS AUTOMÁTICAMENTE ANTES DE MOSTRAR
        await limpiarDuplicadosEvento(eventoId);
        
        const [resultEst, resultPer] = await Promise.all([
            tursodb.query(`
                SELECT a.timestamp, e.codigo_unico, e.dni, e.nombre, e.apellido_paterno, e.apellido_materno,
                    e.especialidad AS categoria, e.anio_formacion AS subcategoria, 'estudiante' AS tipo
                FROM asistencias a
                JOIN estudiantes e ON a.estudiante_id = e.id
                WHERE a.evento_id = ?
                ORDER BY e.especialidad, e.anio_formacion, e.codigo_unico
            `, [eventoId]),
            tursodb.query(`
                SELECT a.timestamp, p.codigo_unico, p.dni, p.nombre, p.apellido_paterno, p.apellido_materno,
                    p.personal AS categoria, p.cargo AS subcategoria, 'personal' AS tipo
                FROM asistencias_personal a
                JOIN administrativos p ON a.personal_id = p.id
                WHERE a.evento_id = ?
                ORDER BY p.personal, p.codigo_unico
            `, [eventoId])
        ]);
        
        const todasAsistencias = [
            ...(resultEst.rows || []),
            ...(resultPer.rows || [])
        ];
        
        if (todasAsistencias.length === 0) {
            listEl.innerHTML = '<p>No hay asistencias registradas para este evento.</p>';
            return;
        }
        
        // Separar estudiantes y personal
        const estudiantes = todasAsistencias.filter(a => a.tipo === 'estudiante');
        const personal = todasAsistencias.filter(a => a.tipo === 'personal');
        const ordenAnios = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
        let html = `<h3>Total de asistencias: ${todasAsistencias.length}</h3>`;

        // ESTUDIANTES: especialidad > año
        const groupedEst = {};
        estudiantes.forEach(a => {
            const esp = a.categoria || 'Sin Especialidad';
            const anio = a.subcategoria || 'Sin Año';
            if (!groupedEst[esp]) groupedEst[esp] = {};
            if (!groupedEst[esp][anio]) groupedEst[esp][anio] = [];
            groupedEst[esp][anio].push(a);
        });
        Object.keys(groupedEst).sort().forEach(especialidad => {
            const totalEsp = Object.values(groupedEst[especialidad]).flat().length;
            const espId = especialidad.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            html += `<div class="accordion"><div class="accordion-header" onclick="toggleAccordion(this)"><span>🎓 ${especialidad} (${totalEsp} asistencias)</span><span>▼</span></div><div class="accordion-content"><div id="anios-${espId}">`;
            Object.keys(groupedEst[especialidad]).sort((a, b) => {
                const ia = ordenAnios.indexOf(a), ib = ordenAnios.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                return a.localeCompare(b);
            }).forEach(anio => {
                const lista = groupedEst[especialidad][anio];
                html += `<div class="sub-accordion"><div class="sub-accordion-header" onclick="toggleSubAccordion(this)"><span>📅 Año ${anio} (${lista.length} asistencias)</span><span>▼</span></div><div class="sub-accordion-content">`;
                lista.forEach(a => {
                    const fecha = new Date(a.timestamp).toLocaleString('es-BO', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
                    html += `<div class="estudiante-item"><div><strong>${formatearNombreCompleto(a.nombre, a.apellido_paterno, a.apellido_materno)}</strong><br><small>📋 ${a.codigo_unico} | 🆔 ${formatearCampoOpcional(a.dni, 'Sin DNI')} | 🕒 ${fecha}</small></div></div>`;
                });
                html += `</div></div>`;
            });
            html += `</div></div></div>`;
        });

        // PERSONAL: lista directa por tipo sin sub-nivel de cargo
        const ordenPersonal = ['DIRECTIVO', 'ADMINISTRATIVO', 'DE SERVICIO', 'DOCENTE'];
        const groupedPer = {};
        personal.forEach(a => {
            const tipo = a.categoria || 'Sin Tipo';
            if (!groupedPer[tipo]) groupedPer[tipo] = [];
            groupedPer[tipo].push(a);
        });
        Object.keys(groupedPer).sort((a, b) => {
            const ia = ordenPersonal.indexOf(a), ib = ordenPersonal.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            return a.localeCompare(b);
        }).forEach(tipo => {
            const lista = groupedPer[tipo];
            html += `<div class="accordion"><div class="accordion-header" onclick="toggleAccordion(this)"><span>👔 ${tipo} (${lista.length} asistencias)</span><span>▼</span></div><div class="accordion-content">`;
            lista.forEach(a => {
                const fecha = new Date(a.timestamp).toLocaleString('es-BO', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
                html += `<div class="estudiante-item"><div><strong>${formatearNombreCompleto(a.nombre, a.apellido_paterno, a.apellido_materno)}</strong><br><small>📋 ${a.codigo_unico} | 🆔 ${formatearCampoOpcional(a.dni, 'Sin DNI')} | 🕒 ${fecha}</small></div></div>`;
            });
            html += `</div></div>`;
        });

        listEl.innerHTML = html;
        
    } catch (error) {
        console.error('Error cargando asistencias:', error);
        listEl.innerHTML = '<p>Error cargando las asistencias.</p>';
    }
}

// Función para limpiar duplicados de un evento específico
async function limpiarDuplicadosEvento(eventoId) {
    try {
        // Mantener solo el registro con el timestamp más temprano para cada estudiante
        const result = await tursodb.query(`
            DELETE FROM asistencias 
            WHERE id IN (
                SELECT a1.id
                FROM asistencias a1
                INNER JOIN (
                    SELECT estudiante_id, MIN(timestamp) as min_timestamp
                    FROM asistencias
                    WHERE evento_id = ?
                    GROUP BY estudiante_id
                    HAVING COUNT(*) > 1
                ) a2 ON a1.estudiante_id = a2.estudiante_id
                WHERE a1.evento_id = ? AND a1.timestamp > a2.min_timestamp
            )
        `, [eventoId, eventoId]);
        
        console.log(`Duplicados eliminados del evento ${eventoId}, manteniendo registros más tempranos`);
        
    } catch (error) {
        console.error('Error limpiando duplicados:', error);
    }
}

async function exportarAsistenciasExcel() {
    if (!currentEventoId) return;
    
    try {
        const [eventoRes, asistEstRes, todosEstRes, asistPerRes, todosPersRes] = await Promise.all([
            tursodb.query(`SELECT * FROM eventos WHERE id = ?`, [currentEventoId]),
            tursodb.query(`
                SELECT a.timestamp, e.codigo_unico, e.dni, e.nombre, e.apellido_paterno, e.apellido_materno, e.especialidad, e.anio_formacion
                FROM asistencias a JOIN estudiantes e ON a.estudiante_id = e.id
                WHERE a.evento_id = ? ORDER BY e.especialidad, e.anio_formacion, e.codigo_unico
            `, [currentEventoId]),
            tursodb.query(`SELECT codigo_unico, dni, nombre, apellido_paterno, apellido_materno, especialidad, anio_formacion FROM estudiantes ORDER BY especialidad, anio_formacion, codigo_unico`),
            tursodb.query(`
                SELECT a.timestamp, p.codigo_unico, p.dni, p.nombre, p.apellido_paterno, p.apellido_materno, p.personal, p.cargo
                FROM asistencias_personal a JOIN administrativos p ON a.personal_id = p.id
                WHERE a.evento_id = ? ORDER BY p.personal, p.codigo_unico
            `, [currentEventoId]),
            tursodb.query(`SELECT codigo_unico, dni, nombre, apellido_paterno, apellido_materno, personal, cargo FROM administrativos ORDER BY personal, codigo_unico`)
        ]);

        const eventoData = eventoRes.rows[0];
        const fechaFin = new Date(`${eventoData.fecha_fin}T${eventoData.hora_fin}`);
        const wb = XLSX.utils.book_new();

        // ===== HOJAS DE ESTUDIANTES POR ESPECIALIDAD =====
        if (todosEstRes.rows && todosEstRes.rows.length > 0) {
            const asistEstMap = new Map();
            (asistEstRes.rows || []).forEach(a => asistEstMap.set(a.codigo_unico, a));

            const porEspecialidad = {};
            todosEstRes.rows.forEach(est => {
                const esp = est.especialidad || 'Sin Especialidad';
                if (!porEspecialidad[esp]) porEspecialidad[esp] = [];
                const asistencia = asistEstMap.get(est.codigo_unico);
                const estado = asistencia ? (new Date(asistencia.timestamp) <= fechaFin ? 'ASISTIO' : 'RETRASO') : 'FALTO';
                porEspecialidad[esp].push({
                    cod: est.codigo_unico,
                    ci: formatearCampoOpcional(est.dni, 'N/A'),
                    nombre: formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno),
                    anio: formatearCampoOpcional(est.anio_formacion, 'N/A'),
                    estado,
                    fecha: asistencia ? new Date(asistencia.timestamp).toLocaleString('es-BO', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }) : 'N/A'
                });
            });

            const ordenAnios = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
            Object.keys(porEspecialidad).sort().forEach(especialidad => {
                const filas = porEspecialidad[especialidad];
                filas.sort((a, b) => {
                    const ia = ordenAnios.indexOf(a.anio), ib = ordenAnios.indexOf(b.anio);
                    if (ia !== ib) return ia - ib;
                    return a.cod.localeCompare(b.cod);
                });
                const asistieron = filas.filter(f => f.estado === 'ASISTIO').length;
                const faltaron = filas.filter(f => f.estado === 'FALTO').length;
                const wsData = [
                    [`REPORTE DE ASISTENCIAS - ${currentEventoNombre.toUpperCase()}`],
                    [`ESPECIALIDAD: ${especialidad.toUpperCase()}`],
                    [`Fecha: ${new Date().toLocaleDateString('es-BO')} | Total: ${filas.length} | Asistieron: ${asistieron} | Faltaron: ${faltaron}`],
                    [],
                    ['Codigo', 'CI', 'Nombre Completo', 'Anio', 'Estado', 'Fecha/Hora']
                ];
                filas.forEach(f => wsData.push([f.cod, f.ci, f.nombre, f.anio, f.estado, f.fecha]));
                const ws = XLSX.utils.aoa_to_sheet(wsData);
                ws['!cols'] = [{ wch:12 }, { wch:12 }, { wch:28 }, { wch:10 }, { wch:10 }, { wch:18 }];
                ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:5} }, { s:{r:1,c:0}, e:{r:1,c:5} }, { s:{r:2,c:0}, e:{r:2,c:5} }];
                const nombreHoja = especialidad.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 31) || 'Especialidad';
                XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
            });
        }

        // ===== HOJA DE PERSONAL ADMINISTRATIVO =====
        if (todosPersRes.rows && todosPersRes.rows.length > 0) {
            const asistPerMap = new Map();
            (asistPerRes.rows || []).forEach(a => asistPerMap.set(a.codigo_unico, a));

            const filasPer = todosPersRes.rows.map(per => {
                const asistencia = asistPerMap.get(per.codigo_unico);
                return [
                    per.codigo_unico,
                    formatearCampoOpcional(per.dni, 'N/A'),
                    formatearNombreCompleto(per.nombre, per.apellido_paterno, per.apellido_materno),
                    per.personal || 'N/A',
                    per.cargo || 'N/A',
                    asistencia ? 'ASISTIO' : 'FALTO',
                    asistencia ? new Date(asistencia.timestamp).toLocaleString('es-BO', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }) : 'N/A'
                ];
            });

            const asistieron = filasPer.filter(f => f[5] === 'ASISTIO').length;
            const faltaron = filasPer.filter(f => f[5] === 'FALTO').length;
            const wsPerData = [
                [`REPORTE DE ASISTENCIAS - ${currentEventoNombre.toUpperCase()}`],
                [`PERSONAL ADMINISTRATIVO`],
                [`Fecha: ${new Date().toLocaleDateString('es-BO')} | Total: ${filasPer.length} | Asistieron: ${asistieron} | Faltaron: ${faltaron}`],
                [],
                ['Codigo', 'CI', 'Nombre Completo', 'Tipo Personal', 'Cargo', 'Estado', 'Fecha/Hora']
            ];
            filasPer.forEach(f => wsPerData.push(f));
            const wsPer = XLSX.utils.aoa_to_sheet(wsPerData);
            wsPer['!cols'] = [{ wch:12 }, { wch:12 }, { wch:28 }, { wch:18 }, { wch:30 }, { wch:10 }, { wch:18 }];
            wsPer['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:6} }, { s:{r:1,c:0}, e:{r:1,c:6} }, { s:{r:2,c:0}, e:{r:2,c:6} }];
            XLSX.utils.book_append_sheet(wb, wsPer, 'Personal');
        }

        const nombreArchivo = `Asistencias_${currentEventoNombre.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);
        alert('Archivo Excel exportado correctamente.');
        
    } catch (error) {
        console.error('Error exportando:', error);
        alert('Error al exportar el archivo.');
    }
}

// ========== GESTIÓN DE PERSONAL ==========

function showPersonal() {
    if (!isAdmin()) {
        alert('Solo administradores pueden gestionar personal');
        return;
    }
    hideAllSections();
    document.getElementById('personal-section').classList.add('active');
    updateAllUserDropdowns();
    loadPersonalSoloQR(); // Solo QRs desde asistencia
    
    // Cambiar botón volver según origen
    const volverBtn = document.querySelector('#personal-section .header-right button');
    volverBtn.onclick = () => showAsistenciaModule();
}

function showGestionPersonal() {
    hideAllSections();
    document.getElementById('personal-section').classList.add('active');
    updateAllUserDropdowns();
    loadPersonalCompleto(); // CRUD completo desde gestión
    
    // Cambiar botón volver según origen
    const volverBtn = document.querySelector('#personal-section .header-right button');
    volverBtn.onclick = () => showGestionUsuarios();
}

function showCargaPersonal() {
    hideAllSections();
    document.getElementById('carga-personal-section').classList.add('active');
    updateAllUserDropdowns();
    mostrarCargaNuevaPersonal();
}

function mostrarCargaNuevaPersonal() {
    document.getElementById('seccion-carga-nueva-personal').style.display = 'block';
    document.getElementById('seccion-actualizacion-personal').style.display = 'none';
    document.getElementById('btn-carga-nueva-personal').className = 'btn-primary';
    document.getElementById('btn-actualizacion-personal').className = 'btn-secondary';
    document.getElementById('resultado-carga-personal').innerHTML = '';
}

function mostrarActualizacionPersonal() {
    document.getElementById('seccion-carga-nueva-personal').style.display = 'none';
    document.getElementById('seccion-actualizacion-personal').style.display = 'block';
    document.getElementById('btn-carga-nueva-personal').className = 'btn-secondary';
    document.getElementById('btn-actualizacion-personal').className = 'btn-primary';
    document.getElementById('admin-password-update-personal').value = '';
    document.getElementById('resultado-carga-personal').innerHTML = '';
}

async function actualizarBDPersonalCompleta() {
    const password = document.getElementById('admin-password-update-personal').value;
    const fileInput = document.getElementById('excel-file-update-personal');
    const resultadoDiv = document.getElementById('resultado-carga-personal');
    
    if (!password) {
        alert('Ingresa tu contraseña de administrador');
        return;
    }
    
    if (password !== 'Admin123!') {
        resultadoDiv.innerHTML = '<p style="color: red;">❌ Contraseña incorrecta</p>';
        return;
    }
    
    if (!fileInput.files[0]) {
        alert('Selecciona un archivo Excel');
        return;
    }
    
    const confirmacion = confirm('⚠️ CONFIRMACIÓN DE ACTUALIZACIÓN\n\nEsto eliminará TODO el personal actual y cargará el nuevo desde Excel.\n\n¿Continuar?');
    
    if (!confirmacion) {
        resultadoDiv.innerHTML = '<p style="color: orange;">🛑 Operación cancelada</p>';
        return;
    }
    
    try {
        resultadoDiv.innerHTML = '<p style="color: blue;">🔄 Actualizando base de datos de personal...</p>';
        
        // Contar personal actual
        const countResult = await tursodb.query('SELECT COUNT(*) as total FROM administrativos');
        const personalAnterior = countResult.rows[0]?.total || 0;
        
        // Eliminar datos existentes
        await tursodb.query('DELETE FROM asistencias_personal');
        await tursodb.query('DELETE FROM administrativos');
        
        resultadoDiv.innerHTML = '<p style="color: blue;">📄 Procesando archivo Excel...</p>';
        
        // Procesar el nuevo archivo
        await procesarExcelPersonalInterno(fileInput.files[0], resultadoDiv, personalAnterior);
        
    } catch (error) {
        console.error('Error actualizando BD personal:', error);
        resultadoDiv.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
    }
}

async function loadPersonalSoloQR() {
    const container = document.getElementById('personal-accordion');
    container.innerHTML = '<p style="color: white;">Cargando...</p>';

    const result = await tursodb.query(`SELECT * FROM administrativos ORDER BY personal, codigo_unico`);
    
    if (!result.rows || result.rows.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay personal registrado. Usa la carga masiva para importar desde Excel.</p>';
        return;
    }

    const data = result.rows;
    data.sort((a, b) => {
        if (a.personal !== b.personal) return a.personal.localeCompare(b.personal);
        return a.codigo_unico.localeCompare(b.codigo_unico);
    });

    const grouped = {};
    data.forEach(person => {
        const tipo = person.personal || 'Sin Tipo';
        if (!grouped[tipo]) grouped[tipo] = [];
        grouped[tipo].push(person);
    });

    container.innerHTML = '';
    
    Object.keys(grouped).sort().forEach(tipoPersonal => {
        const accordion = document.createElement('div');
        accordion.className = 'accordion';
        
        const totalPersonal = grouped[tipoPersonal].length;
        const tipoId = tipoPersonal.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        
        accordion.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <span>👔 ${tipoPersonal} (${totalPersonal} personas)</span>
                <div>
                    <button class="btn-success" style="padding: 5px 10px; font-size: 12px;">📥 QRs</button>
                    <span style="margin-left: 10px;">▼</span>
                </div>
            </div>
            <div class="accordion-content">
                <div id="personal-${tipoId}"></div>
            </div>
        `;
        container.appendChild(accordion);

        const btnQRs = accordion.querySelector('.btn-success');
        btnQRs.onclick = function(e) {
            e.stopPropagation();
            generarQRsPersonalDirecto(tipoPersonal);
        };

        const personalContainer = accordion.querySelector(`#personal-${tipoId}`);
        personalContainer.innerHTML = grouped[tipoPersonal].map(person => `
            <div class="estudiante-item">
                <div>
                    <strong>${formatearNombreCompleto(person.nombre, person.apellido_paterno, person.apellido_materno)}</strong><br>
                    <small>📋 ${person.codigo_unico} | 🆔 ${formatearCampoOpcional(person.dni, 'Sin DNI')} | 💼 ${formatearCampoOpcional(person.cargo, 'Sin cargo')} | 📱 ${formatearCampoOpcional(person.celular, 'Sin celular')}</small>
                </div>
            </div>
        `).join('');
    });
}

async function loadPersonalCompleto() {
    const container = document.getElementById('personal-accordion');
    container.innerHTML = '<p style="color: white;">Cargando...</p>';

    const result = await tursodb.query(`SELECT * FROM administrativos ORDER BY personal, codigo_unico`);
    
    if (!result.rows || result.rows.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay personal registrado. Usa la carga masiva para importar desde Excel.</p>';
        return;
    }

    const data = result.rows;
    data.sort((a, b) => {
        if (a.personal !== b.personal) return a.personal.localeCompare(b.personal);
        return a.codigo_unico.localeCompare(b.codigo_unico);
    });

    const grouped = {};
    data.forEach(person => {
        const tipo = person.personal || 'Sin Tipo';
        if (!grouped[tipo]) grouped[tipo] = [];
        grouped[tipo].push(person);
    });

    container.innerHTML = '';
    
    Object.keys(grouped).sort().forEach(tipoPersonal => {
        const accordion = document.createElement('div');
        accordion.className = 'accordion';
        
        const totalPersonal = grouped[tipoPersonal].length;
        const tipoId = tipoPersonal.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        
        accordion.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <span>👔 ${tipoPersonal} (${totalPersonal} personas)</span>
                <div>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">+ Agregar</button>
                    <span style="margin-left: 10px;">▼</span>
                </div>
            </div>
            <div class="accordion-content">
                <div id="personal-${tipoId}"></div>
            </div>
        `;
        container.appendChild(accordion);

        const btnAgregar = accordion.querySelector('.btn-primary');
        btnAgregar.onclick = function(e) {
            e.stopPropagation();
            agregarPersonalA(tipoPersonal);
        };

        const personalContainer = accordion.querySelector(`#personal-${tipoId}`);
        personalContainer.innerHTML = grouped[tipoPersonal].map(person => `
            <div class="estudiante-item">
                <div>
                    <strong>${formatearNombreCompleto(person.nombre, person.apellido_paterno, person.apellido_materno)}</strong><br>
                    <small>📋 ${person.codigo_unico} | 🆔 ${formatearCampoOpcional(person.dni, 'Sin DNI')} | 💼 ${formatearCampoOpcional(person.cargo, 'Sin cargo')} | 📱 ${formatearCampoOpcional(person.celular, 'Sin celular')} | ✉️ ${formatearCampoOpcional(person.email, 'Sin email')}</small>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="btn-info" style="padding: 5px 10px; font-size: 11px;" onclick="editarPersonal('${person.id}')">✏️</button>
                    <button class="btn-danger" style="padding: 5px 10px; font-size: 11px;" onclick="eliminarPersonal('${person.id}', '${formatearNombreCompleto(person.nombre, person.apellido_paterno, person.apellido_materno).replace(/'/g, "\\'")}')">🗑️</button>
                </div>
            </div>
        `).join('');
    });
}

async function procesarExcelPersonalInterno(file, resultadoDiv, personalAnterior = 0) {
    console.log('Archivo seleccionado:', file.name, 'Tamaño:', file.size);
    resultadoDiv.innerHTML = '<p style="color: blue;">📁 Leyendo archivo Excel...</p>';

    try {
        const data = await file.arrayBuffer();
        console.log('Archivo leído, tamaño del buffer:', data.byteLength);
        resultadoDiv.innerHTML = '<p style="color: blue;">📊 Procesando datos...</p>';
        
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        console.log('Datos extraídos:', jsonData.length, 'filas');
        console.log('Primeras 3 filas:', jsonData.slice(0, 3));

        if (jsonData.length === 0) {
            resultadoDiv.innerHTML = '<p style="color: red;">❌ El archivo está vacío</p>';
            return;
        }

        // Detectar si tiene cabeceras
        let startRow = 0;
        const firstRow = jsonData[0];
        if (firstRow && firstRow.some(cell => 
            typeof cell === 'string' && 
            (cell.toLowerCase().includes('nombre') || 
             cell.toLowerCase().includes('dni') || 
             cell.toLowerCase().includes('codigo'))
        )) {
            startRow = 1;
            console.log('Cabeceras detectadas, iniciando desde fila 2');
        } else {
            console.log('Sin cabeceras, procesando desde fila 1');
        }

        let exitosos = 0;
        let errores = 0;
        const erroresDetalle = [];
        const totalFilas = jsonData.length - startRow;
        
        resultadoDiv.innerHTML = `<p style="color: blue;">⏳ Procesando ${totalFilas} personas...</p>`;

        for (let i = startRow; i < jsonData.length; i++) {
            const fila = jsonData[i];
            
            // Actualizar progreso cada 10 registros
            if ((i - startRow) % 10 === 0) {
                const progreso = Math.round(((i - startRow) / totalFilas) * 100);
                resultadoDiv.innerHTML = `<p style="color: blue;">⏳ Procesando... ${progreso}% (${i - startRow}/${totalFilas})</p>`;
            }
            
            // Saltar filas vacías
            if (!fila || fila.every(cell => !cell)) {
                console.log(`Fila ${i + 1} vacía, saltando`);
                continue;
            }
            
            try {
                const personal = {
                    codigo_unico: fila[0] ? fila[0].toString().trim() : '',
                    dni: fila[1] ? fila[1].toString().trim() : '',
                    nombre: fila[2] ? fila[2].toString().toUpperCase().trim() : '',
                    apellido_paterno: fila[3] ? fila[3].toString().toUpperCase().trim() : '',
                    apellido_materno: (fila[4] && fila[4].toString().trim()) ? fila[4].toString().toUpperCase().trim() : 'SIN DATO',
                    personal: fila[5] ? fila[5].toString().toUpperCase().trim() : '',
                    cargo: fila[6] ? fila[6].toString().toUpperCase().trim() : '',
                    celular: fila[7] ? fila[7].toString().trim() : null,
                    email: (fila[8] && fila[8].toString().trim()) ? fila[8].toString().toLowerCase().trim() : null,
                    password: fila[9] ? fila[9].toString().trim() : (fila[0] ? fila[0].toString().trim() : 'personal123')
                };
                
                // Validar campos obligatorios
                if (!personal.codigo_unico || !personal.dni || !personal.nombre || !personal.apellido_paterno || !personal.personal || !personal.cargo) {
                    errores++;
                    const camposFaltantes = [];
                    if (!personal.codigo_unico) camposFaltantes.push('código');
                    if (!personal.dni) camposFaltantes.push('DNI');
                    if (!personal.nombre) camposFaltantes.push('nombre');
                    if (!personal.apellido_paterno) camposFaltantes.push('apellido paterno');
                    if (!personal.personal) camposFaltantes.push('tipo de personal');
                    if (!personal.cargo) camposFaltantes.push('cargo');
                    
                    const errorMsg = `Fila ${i + 1} (${personal.codigo_unico || 'Sin código'}): Faltan campos obligatorios: ${camposFaltantes.join(', ')}`;
                    erroresDetalle.push(errorMsg);
                    console.log(`❌ ${errorMsg}`);
                    console.log('Datos de la fila:', personal);
                    continue;
                }
                
                console.log(`Insertando personal ${exitosos + 1}:`, personal.codigo_unico, personal.nombre);
                
                const { error } = await tursodb.from('administrativos').insert(personal);

                if (error) {
                    errores++;
                    erroresDetalle.push(`Fila ${i + 1}: ${error.message}`);
                    console.error(`Error insertando fila ${i + 1}:`, error);
                } else {
                    exitosos++;
                }
            } catch (err) {
                errores++;
                erroresDetalle.push(`Fila ${i + 1}: ${err.message}`);
                console.error(`Error procesando fila ${i + 1}:`, err);
            }
        }

        let resultado = `<h4>📊 Proceso completado:</h4>`;
        resultado += `<p style="color: green; font-size: 18px;">✅ Personal cargado: <strong>${exitosos}</strong></p>`;
        if (errores > 0) {
            resultado += `<p style="color: red; font-size: 18px;">❌ Errores encontrados: <strong>${errores}</strong></p>`;
            resultado += `<p style="color: orange; font-size: 14px;">⚠️ Revisa los datos y corrige los errores antes de continuar</p>`;
        }
        
        if (erroresDetalle.length > 0) {
            resultado += `<details style="margin-top: 15px;"><summary style="cursor: pointer; font-weight: bold;">👁️ Ver detalles de errores (${errores})</summary><ul style="margin-top: 10px;">`;
            erroresDetalle.slice(0, 20).forEach(error => {
                resultado += `<li style="color: red; margin: 5px 0;">${error}</li>`;
            });
            if (erroresDetalle.length > 20) {
                resultado += `<li style="color: orange;">... y ${erroresDetalle.length - 20} errores más</li>`;
            }
            resultado += `</ul></details>`;
        }

        resultadoDiv.innerHTML = resultado;
        console.log('Proceso completado:', { exitosos, errores });
        
        if (exitosos > 0) {
            setTimeout(() => {
                if (errores > 0) {
                    alert(`⚠️ Proceso completado con errores\n✅ ${exitosos} personas cargadas\n❌ ${errores} errores encontrados\n\nRevisa los detalles en pantalla y corrige los datos faltantes.`);
                } else {
                    const mensaje = personalAnterior > 0 
                        ? `🔄 ¡Base de datos actualizada!\n❌ ${personalAnterior} personas anteriores eliminadas\n✅ ${exitosos} nuevas personas cargadas\n❌ 0 errores`
                        : `🎉 ¡Proceso completado exitosamente!\n✅ ${exitosos} personas cargadas\n❌ 0 errores`;
                    alert(mensaje);
                }
            }, 1000);
        } else if (errores > 0) {
            setTimeout(() => {
                alert(`❌ No se pudo cargar ninguna persona\n${errores} errores encontrados\n\nRevisa el formato del archivo Excel.`);
            }, 1000);
        }

    } catch (error) {
        console.error('Error general:', error);
        resultadoDiv.innerHTML = `<p style="color: red;">❌ Error procesando archivo: ${error.message}</p>`;
        alert('Error: ' + error.message);
    }
}

async function procesarExcelPersonal() {
    const fileInput = document.getElementById('excel-file-personal');
    const resultadoDiv = document.getElementById('resultado-carga-personal');
    
    if (!fileInput.files[0]) {
        alert('Selecciona un archivo Excel');
        return;
    }
    
    console.log('Archivo seleccionado:', fileInput.files[0].name);
    resultadoDiv.innerHTML = '<p style="color: blue;">📁 Leyendo archivo Excel...</p>';

    try {
        const data = await fileInput.files[0].arrayBuffer();
        resultadoDiv.innerHTML = '<p style="color: blue;">📊 Procesando datos...</p>';
        
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
            resultadoDiv.innerHTML = '<p style="color: red;">❌ El archivo está vacío</p>';
            return;
        }

        // Detectar cabeceras
        let startRow = 0;
        const firstRow = jsonData[0];
        if (firstRow && firstRow.some(cell => 
            typeof cell === 'string' && 
            (cell.toLowerCase().includes('nombre') || 
             cell.toLowerCase().includes('dni') || 
             cell.toLowerCase().includes('codigo'))
        )) {
            startRow = 1;
        }

        let exitosos = 0;
        let errores = 0;
        const erroresDetalle = [];
        const totalFilas = jsonData.length - startRow;
        
        for (let i = startRow; i < jsonData.length; i++) {
            const fila = jsonData[i];
            
            if (!fila || fila.every(cell => !cell)) continue;
            
            try {
                // Limpiar espacios extra y manejar campos vacíos
                const personal = {
                    codigo_unico: fila[0] ? fila[0].toString().trim() : '',
                    dni: fila[1] ? fila[1].toString().trim() : '',
                    nombre: fila[2] ? fila[2].toString().toUpperCase().trim() : '',
                    apellido_paterno: fila[3] ? fila[3].toString().toUpperCase().trim() : '',
                    apellido_materno: (fila[4] && fila[4].toString().trim()) ? fila[4].toString().toUpperCase().trim() : 'SIN DATO',
                    personal: fila[5] ? fila[5].toString().toUpperCase().trim() : '',
                    cargo: fila[6] ? fila[6].toString().toUpperCase().trim() : '',
                    celular: fila[7] ? fila[7].toString().trim() : null,
                    email: (fila[8] && fila[8].toString().trim()) ? fila[8].toString().toLowerCase().trim() : null,
                    password: fila[9] ? fila[9].toString().trim() : (fila[0] ? fila[0].toString().trim() : 'personal123') // Nueva columna de contraseña
                };
                
                if (!personal.codigo_unico || !personal.dni || !personal.nombre || !personal.apellido_paterno || !personal.personal || !personal.cargo) {
                    errores++;
                    const camposFaltantes = [];
                    if (!personal.codigo_unico) camposFaltantes.push('código');
                    if (!personal.dni) camposFaltantes.push('DNI');
                    if (!personal.nombre) camposFaltantes.push('nombre');
                    if (!personal.apellido_paterno) camposFaltantes.push('apellido paterno');
                    if (!personal.personal) camposFaltantes.push('tipo de personal');
                    if (!personal.cargo) camposFaltantes.push('cargo');
                    
                    erroresDetalle.push(`Fila ${i + 1}: Faltan campos obligatorios: ${camposFaltantes.join(', ')}`);
                    continue;
                }
                
                const { error } = await tursodb.from('administrativos').insert(personal);

                if (error) {
                    errores++;
                    erroresDetalle.push(`Fila ${i + 1}: ${error.message}`);
                } else {
                    exitosos++;
                }
            } catch (err) {
                errores++;
                erroresDetalle.push(`Fila ${i + 1}: ${err.message}`);
            }
        }

        let resultado = `<h4>📊 Proceso completado:</h4>`;
        resultado += `<p style="color: green; font-size: 18px;">✅ Personal cargado: <strong>${exitosos}</strong></p>`;
        if (errores > 0) {
            resultado += `<p style="color: red; font-size: 18px;">❌ Errores: <strong>${errores}</strong></p>`;
        }
        
        resultadoDiv.innerHTML = resultado;
        
        if (exitosos > 0) {
            setTimeout(() => {
                alert(`🎉 Proceso completado\n✅ ${exitosos} personas cargadas\n❌ ${errores} errores`);
            }, 1000);
        }

    } catch (error) {
        console.error('Error:', error);
        resultadoDiv.innerHTML = `<p style="color: red;">❌ Error: ${error.message}</p>`;
    }
}

async function generarQRsPersonalDirecto(tipoPersonal) {
    currentTipoPersonal = tipoPersonal; // Guardar tipo para el ZIP
    currentEspecialidad = null; // Limpiar variables de estudiantes
    currentAnio = null; // Limpiar variables de estudiantes
    origenQR = 'personal'; // Marcar origen
    
    hideAllSections();
    document.getElementById('generar-qr-section').classList.add('active');
    updateAllUserDropdowns();
    
    // Actualizar botón volver para personal
    const volverBtn = document.querySelector('#generar-qr-section .header-right button');
    if (volverBtn) {
        volverBtn.onclick = () => showPersonal();
    }
    
    const container = document.getElementById('qr-container');
    container.innerHTML = '<p style="color: white;">Generando QRs...</p>';
    qrCodesGenerated = [];

    const result = await tursodb.query(`SELECT * FROM administrativos WHERE personal = ? ORDER BY codigo_unico`, [tipoPersonal]);
    
    if (!result.rows || result.rows.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay personal para este tipo</p>';
        return;
    }
    
    const personalFiltrado = result.rows;

    // Actualizar el botón de descarga con información contextual
    const headerContainer = document.querySelector('#generar-qr-section .container');
    const btnZip = headerContainer.querySelector('.btn-success');
    if (btnZip) {
        // Crear div de información si no existe
        let infoDiv = headerContainer.querySelector('.qr-info');
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.className = 'qr-info';
            infoDiv.style.cssText = 'background: rgba(255,255,255,0.95); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
            btnZip.parentNode.insertBefore(infoDiv, btnZip.nextSibling);
        }
        infoDiv.innerHTML = `
            <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">
                👔 ${tipoPersonal}
            </p>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">
                👥 Total: ${personalFiltrado.length} personas
            </p>
        `;
    }

    container.innerHTML = '';
    
    personalFiltrado.forEach((person, index) => {
        const qrItem = document.createElement('div');
        qrItem.className = 'qr-item';
        const nombreCompleto = formatearNombreCompleto(person.nombre, person.apellido_paterno, person.apellido_materno);
        qrItem.innerHTML = `
            <h3>${nombreCompleto}</h3>
            <p><strong>${person.codigo_unico}</strong></p>
            <div class="qr-code" id="qr-${index}"></div>
            <button class="download-btn" onclick="downloadSingleQRPersonal('qr-${index}', '${nombreCompleto.replace(/\s+/g, '_')}')">📥 Descargar</button>
        `;
        container.appendChild(qrItem);

        setTimeout(() => {
            const qrElement = document.getElementById(`qr-${index}`);
            if (qrElement && typeof qrcode !== 'undefined') {
                const qrData = `${nombreCompleto}|${person.cargo}|${person.codigo_unico}`;
                const qr = qrcode(0, 'M');
                qr.addData(qrData);
                qr.make();
                
                const size = 120;
                const cellSize = size / qr.getModuleCount();
                
                let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
                svg += `<rect width="${size}" height="${size}" fill="white"/>`;
                
                for (let row = 0; row < qr.getModuleCount(); row++) {
                    for (let col = 0; col < qr.getModuleCount(); col++) {
                        if (qr.isDark(row, col)) {
                            const x = col * cellSize;
                            const y = row * cellSize;
                            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
                        }
                    }
                }
                svg += '</svg>';
                
                qrElement.innerHTML = svg;
            }
        }, index * 100);

        qrCodesGenerated.push({ id: `qr-${index}`, nombre: nombreCompleto.replace(/\s+/g, '_') });
    });
}

function downloadSingleQRPersonal(elementId, filename) {
    const svgElement = document.querySelector(`#${elementId} svg`);
    if (!svgElement) return;
    
    // Crear canvas para convertir SVG a PNG - 2.5cm a 300 DPI = 295px
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 295; // 2.5cm a 300 DPI
    
    canvas.width = size;
    canvas.height = size;
    
    // Convertir SVG a imagen
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = function() {
        ctx.drawImage(img, 0, 0, size, size);
        
        // Convertir a blob con metadatos DPI
        canvas.toBlob(function(blob) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Modificar metadatos PNG para 300 DPI
                const modifiedBuffer = setPNGDPI(uint8Array, 300);
                
                const newBlob = new Blob([modifiedBuffer], { type: 'image/png' });
                const link = document.createElement('a');
                link.download = `${filename}.png`;
                link.href = URL.createObjectURL(newBlob);
                link.click();
                URL.revokeObjectURL(link.href);
                URL.revokeObjectURL(url);
            };
            reader.readAsArrayBuffer(blob);
        }, 'image/png', 1.0);
    };
    img.src = url;
}

let currentTipoPersonal = null;
let origenQR = 'estudiantes'; // Guardar origen: 'estudiantes' o 'personal'
let origenGestion = 'asistencia'; // Guardar origen: 'asistencia' o 'gestion'

function agregarPersonalA(tipoPersonal) {
    currentTipoPersonal = tipoPersonal;
    showAgregarPersonal();
    
    // Actualizar botón volver según origen
    setTimeout(() => {
        const volverBtn = document.querySelector('#agregar-personal-section .header-right button');
        if (volverBtn) {
            volverBtn.onclick = () => showGestionPersonal();
        }
    }, 100);
}

function showAgregarPersonal() {
    hideAllSections();
    document.getElementById('agregar-personal-section').classList.add('active');
    updateAllUserDropdowns();
    document.getElementById('form-tipo-personal').textContent = currentTipoPersonal;
}

async function agregarPersonal() {
    const codigo = document.getElementById('per-codigo').value;
    const dni = document.getElementById('per-dni').value;
    const nombre = document.getElementById('per-nombre').value;
    const apellidoPaterno = document.getElementById('per-apellido-paterno').value;
    const apellidoMaterno = document.getElementById('per-apellido-materno').value || 'SIN DATO';
    const cargo = document.getElementById('per-cargo').value;
    const celular = document.getElementById('per-celular').value;
    const email = document.getElementById('per-email').value;
    const password = document.getElementById('per-password').value;

    if (!codigo || !dni || !nombre || !apellidoPaterno || !cargo || !password) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    try {
        const { error } = await tursodb.from('administrativos').insert({
            codigo_unico: codigo,
            dni: dni,
            nombre,
            apellido_paterno: apellidoPaterno,
            apellido_materno: apellidoMaterno,
            personal: currentTipoPersonal,
            cargo: cargo,
            celular: celular || null,
            email: email || null,
            password: password
        });

        if (error) {
            alert('Error: ' + error.message);
            return;
        }

        // Limpiar formulario
        ['per-codigo', 'per-dni', 'per-nombre', 'per-apellido-paterno', 'per-apellido-materno', 'per-cargo', 'per-celular', 'per-email', 'per-password'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('per-password').value = 'personal123';

        alert('✓ Personal agregado correctamente');
        showGestionPersonal();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarPersonal(personalId, nombreCompleto) {
    if (!confirm(`¿Eliminar a ${nombreCompleto}?\n\nEsta acción no se puede deshacer.`)) return;
    
    try {
        await tursodb.query('DELETE FROM administrativos WHERE id = ?', [personalId]);
        alert('Personal eliminado correctamente');
        loadPersonalCompleto();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

async function editarPersonal(personalId) {
    try {
        const result = await tursodb.query('SELECT * FROM administrativos WHERE id = ?', [personalId]);
        if (!result.rows || result.rows.length === 0) {
            alert('Personal no encontrado');
            return;
        }
        
        const personal = result.rows[0];
        
        hideAllSections();
        document.getElementById('editar-personal-section').classList.add('active');
        updateAllUserDropdowns();
        
        document.getElementById('edit-per-id').value = personal.id;
        document.getElementById('edit-form-tipo-personal').textContent = personal.personal;
        document.getElementById('edit-per-codigo').value = personal.codigo_unico;
        document.getElementById('edit-per-dni').value = personal.dni;
        document.getElementById('edit-per-nombre').value = personal.nombre;
        document.getElementById('edit-per-apellido-paterno').value = personal.apellido_paterno;
        document.getElementById('edit-per-apellido-materno').value = personal.apellido_materno || '';
        document.getElementById('edit-per-cargo').value = personal.cargo;
        document.getElementById('edit-per-celular').value = personal.celular || '';
        document.getElementById('edit-per-email').value = personal.email || '';
        document.getElementById('edit-per-password').value = personal.password || 'personal123';
    } catch (error) {
        alert('Error cargando personal: ' + error.message);
    }
}

async function actualizarPersonal() {
    const id = document.getElementById('edit-per-id').value;
    const codigo = document.getElementById('edit-per-codigo').value;
    const dni = document.getElementById('edit-per-dni').value;
    const nombre = document.getElementById('edit-per-nombre').value;
    const apellidoPaterno = document.getElementById('edit-per-apellido-paterno').value;
    const apellidoMaterno = document.getElementById('edit-per-apellido-materno').value || 'SIN DATO';
    const cargo = document.getElementById('edit-per-cargo').value;
    const celular = document.getElementById('edit-per-celular').value || null;
    const email = document.getElementById('edit-per-email').value || null;
    const password = document.getElementById('edit-per-password').value;

    if (!codigo || !dni || !nombre || !apellidoPaterno || !cargo || !password) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    try {
        await tursodb.query(`
            UPDATE administrativos 
            SET codigo_unico = ?, dni = ?, nombre = ?, apellido_paterno = ?, apellido_materno = ?, cargo = ?, celular = ?, email = ?, password = ?
            WHERE id = ?
        `, [codigo, dni, nombre, apellidoPaterno, apellidoMaterno, cargo, celular, email, password, id]);

        alert('✓ Personal actualizado correctamente');
        showGestionPersonal();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function showListaUsuarios() {
    if (!isAdmin()) {
        alert('Solo administradores pueden gestionar usuarios');
        return;
    }
    hideAllSections();
    document.getElementById('lista-usuarios-section').classList.add('active');
    loadUsuarios();
}

function showEditarUsuario(usuarioId) {
    if (!isAdmin()) {
        alert('Solo administradores pueden editar usuarios');
        return;
    }
    hideAllSections();
    document.getElementById('editar-usuario-section').classList.add('active');
    loadUsuarioParaEditar(usuarioId);
}


function showRegistroUsuarios() {
    hideAllSections();
    document.getElementById('registro-usuarios-section').classList.add('active');
    updateAllUserDropdowns();
}

function registrarUsuario() {
    const nombre = document.getElementById('usuario-nombre')?.value?.trim();
    const apellidoPaterno = document.getElementById('usuario-apellido-paterno')?.value?.trim();
    const apellidoMaterno = document.getElementById('usuario-apellido-materno')?.value?.trim() || 'SIN DATO';
    const ci = document.getElementById('usuario-ci')?.value?.trim() || 'SIN DATO';
    const celular = document.getElementById('usuario-celular')?.value?.trim() || 'SIN DATO';
    const email = document.getElementById('usuario-email')?.value?.trim();
    const password = document.getElementById('usuario-password')?.value;
    const especialidad = document.getElementById('usuario-especialidad')?.value?.trim() || 'SIN DATO';
    const codigoUnico = document.getElementById('usuario-codigo-unico')?.value?.trim() || 'SIN DATO';
    const rol = document.getElementById('usuario-rol')?.value;

    if (!nombre || !apellidoPaterno || !email || !password || !rol) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }

    const nombreCompleto = `${nombre} ${apellidoPaterno} ${apellidoMaterno !== 'SIN DATO' ? apellidoMaterno : ''}`.trim();

    // Llamar directamente a la inserción sin usar registrarDocente
    insertarUsuario({
        ci,
        nombre: nombreCompleto,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        email,
        password,
        celular,
        especialidad,
        codigo_unico: codigoUnico,
        rol
    });

    // Limpiar formulario
    const campos = ['usuario-nombre', 'usuario-apellido-paterno', 'usuario-apellido-materno', 'usuario-ci', 'usuario-celular', 'usuario-email', 'usuario-password', 'usuario-especialidad', 'usuario-codigo-unico', 'usuario-rol'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function insertarUsuario(userData) {
    if (!checkAdminPermissions()) {
        alert('Solo los administradores pueden registrar usuarios');
        return;
    }

    try {
        const { error } = await tursodb.from('usuarios').insert(userData);

        if (error) {
            alert('Error: ' + error.message);
            return;
        }

        alert('✓ Usuario registrado correctamente');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}
function showListaUsuarios() {
    hideAllSections();
    document.getElementById('lista-usuarios-section').classList.add('active');
    updateAllUserDropdowns();
    loadUsuariosTurso();
}

async function loadUsuariosTurso() {
    const listEl = document.getElementById('usuarios-list');
    if (!listEl) {
        console.error('Elemento usuarios-list no encontrado');
        return;
    }
    
    listEl.innerHTML = '<p style="color: white;">Cargando usuarios...</p>';

    try {
        const result = await tursodb.query('SELECT * FROM usuarios ORDER BY created_at DESC');
        
        if (!result.rows || result.rows.length === 0) {
            listEl.innerHTML = '<p style="color: white;">No hay usuarios registrados</p>';
            return;
        }

        let html = '<div class="usuarios-grid">';
        
        result.rows.forEach(usuario => {
            const rol = usuario.rol || 'usuario';
            const nombre = usuario.nombre || 'Sin nombre';
            const ci = usuario.ci || 'Sin CI';
            const celular = usuario.celular || '';
            
            html += `
                <div class="usuario-card">
                    <div class="usuario-info">
                        <h3>${nombre}</h3>
                        <p><strong>Email:</strong> ${usuario.email}</p>
                        <p><strong>CI:</strong> ${ci}</p>
                        <p><strong>Rol:</strong> <span class="rol-badge ${rol}">${rol.toUpperCase()}</span></p>
                        <p><strong>Celular:</strong> ${celular || 'N/A'}</p>
                        <p><strong>Especialidad:</strong> ${usuario.especialidad || 'N/A'}</p>
                    </div>
                    <div class="usuario-actions">
                        <button onclick="editarUsuarioTurso('${usuario.id}')" class="btn-info">✏️ Editar</button>
                        ${usuario.email !== 'admin@escuela.com' ? 
                            `<button onclick="eliminarUsuarioTurso('${usuario.id}', '${nombre.replace(/'/g, "\\'")}')" class="btn-danger">🗑️ Eliminar</button>` : 
                            '<span style="color: #666; font-size: 12px;">Admin principal</span>'
                        }
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        listEl.innerHTML = html;
        
    } catch (error) {
        console.error('Error:', error);
        listEl.innerHTML = '<p style="color: white;">Error de conexión</p>';
    }
}

async function eliminarUsuarioTurso(usuarioId, nombre) {
    if (!confirm(`¿Estás seguro de eliminar al usuario "${nombre}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        await tursodb.query('DELETE FROM usuarios WHERE id = ?', [usuarioId]);
        alert('✓ Usuario eliminado correctamente');
        loadUsuariosTurso();
    } catch (error) {
        console.error('Error:', error);
        alert('Error eliminando usuario');
    }
}

async function editarUsuarioTurso(usuarioId) {
    try {
        const result = await tursodb.query('SELECT * FROM usuarios WHERE id = ?', [usuarioId]);
        
        if (!result.rows || result.rows.length === 0) {
            alert('Error cargando datos del usuario');
            return;
        }
        
        const usuario = result.rows[0];
        
        hideAllSections();
        document.getElementById('editar-usuario-section').classList.add('active');
        updateAllUserDropdowns();
        
        document.getElementById('edit-usuario-id').value = usuario.id;
        document.getElementById('edit-usuario-ci').value = usuario.ci || '';
        document.getElementById('edit-usuario-nombre').value = usuario.nombre || '';
        document.getElementById('edit-usuario-email').value = usuario.email || '';
        document.getElementById('edit-usuario-celular').value = usuario.celular || '';
        document.getElementById('edit-usuario-especialidad').value = usuario.especialidad || '';
        document.getElementById('edit-usuario-codigo').value = usuario.codigo_unico || '';
        document.getElementById('edit-usuario-rol').value = usuario.rol || 'usuario';
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error cargando usuario');
    }
}

async function actualizarUsuarioTurso() {
    const usuarioId = document.getElementById('edit-usuario-id').value;
    const ci = document.getElementById('edit-usuario-ci').value;
    const nombre = document.getElementById('edit-usuario-nombre').value;
    const email = document.getElementById('edit-usuario-email').value;
    const password = document.getElementById('edit-usuario-password').value;
    const celular = document.getElementById('edit-usuario-celular').value;
    const especialidad = document.getElementById('edit-usuario-especialidad').value;
    const codigoUnico = document.getElementById('edit-usuario-codigo').value;
    const rol = document.getElementById('edit-usuario-rol').value;

    if (!nombre || !email) {
        alert('Nombre y email son obligatorios');
        return;
    }

    try {
        // Si hay contraseña, actualizar con contraseña
        if (password && password.trim() !== '') {
            await tursodb.query(`
                UPDATE usuarios 
                SET ci = ?, nombre = ?, email = ?, password = ?, celular = ?, especialidad = ?, codigo_unico = ?, rol = ?
                WHERE id = ?
            `, [ci, nombre, email, password, celular, especialidad, codigoUnico, rol, usuarioId]);
        } else {
            // Sin contraseña, actualizar sin cambiar contraseña
            await tursodb.query(`
                UPDATE usuarios 
                SET ci = ?, nombre = ?, email = ?, celular = ?, especialidad = ?, codigo_unico = ?, rol = ?
                WHERE id = ?
            `, [ci, nombre, email, celular, especialidad, codigoUnico, rol, usuarioId]);
        }

        alert('✓ Usuario actualizado correctamente');
        showListaUsuarios();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error actualizando usuario');
    }
}
// Control de permisos por rol
function checkAdminPermissions() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    return currentUser && currentUser.rol === 'admin';
}

function showGestionUsuarios() {
    if (!checkAdminPermissions()) {
        alert('Solo los administradores pueden acceder a la gestión de usuarios');
        return;
    }
    hideAllSections();
    document.getElementById('gestion-usuarios-section').classList.add('active');
}


// Sistema inicializado al cargar
window.addEventListener('DOMContentLoaded', async function() {
    loadOfflineQueue();
    loadEstudiantesCache();
    startAutoSync();
    updateEstudiantesCache();

    const fromModule = sessionStorage.getItem('fromModule');
    if (fromModule) {
        sessionStorage.removeItem('fromModule');
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (user) {
            currentUser = user;
            showDashboard();
        } else {
            showLogin();
        }
    } else {
        showLogin();
    }

    await tursodb.initializeData();
});


function showGestionEstudiantesCompleto() {
    origenGestion = 'gestion'; // Marcar que venimos de gestión
    hideAllSections();
    document.getElementById('estudiantes-section').classList.add('active');
    updateAllUserDropdowns();
    loadEstudiantesConEdicion();
    
    // Cambiar botón volver según origen
    const volverBtn = document.querySelector('#estudiantes-section .header-right button');
    volverBtn.onclick = () => showGestionUsuarios();
}

async function loadEstudiantesConEdicion() {
    const container = document.getElementById('especialidades-accordion');
    container.innerHTML = '<p style="color: white;">Cargando...</p>';

    const result = await tursodb.query(`SELECT * FROM estudiantes ORDER BY especialidad, anio_formacion, codigo_unico`);
    
    if (!result.rows || result.rows.length === 0) {
        container.innerHTML = '<p style="color: white;">No hay estudiantes. Usa la carga masiva para importar desde Excel.</p>';
        return;
    }

    const data = result.rows;
    data.sort((a, b) => {
        if (a.especialidad !== b.especialidad) return a.especialidad.localeCompare(b.especialidad);
        if (a.anio_formacion !== b.anio_formacion) {
            const orden = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
            return orden.indexOf(a.anio_formacion) - orden.indexOf(b.anio_formacion);
        }
        return a.codigo_unico.localeCompare(b.codigo_unico);
    });

    const grouped = {};
    data.forEach(est => {
        const esp = est.especialidad || 'Sin Especialidad';
        const anio = est.anio_formacion || 'Sin Año';
        if (!grouped[esp]) grouped[esp] = {};
        if (!grouped[esp][anio]) grouped[esp][anio] = [];
        grouped[esp][anio].push(est);
    });

    container.innerHTML = '';
    
    Object.keys(grouped).sort().forEach(especialidad => {
        const accordion = document.createElement('div');
        accordion.className = 'accordion';
        
        const totalEst = Object.values(grouped[especialidad]).flat().length;
        const espId = especialidad.replace(/\s/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        
        accordion.innerHTML = `
            <div class="accordion-header" onclick="toggleAccordion(this)">
                <span>🎓 ${especialidad} (${totalEst} estudiantes)</span>
                <span>▼</span>
            </div>
            <div class="accordion-content">
                <div id="anios-${espId}"></div>
            </div>
        `;
        container.appendChild(accordion);

        const aniosContainer = accordion.querySelector(`#anios-${espId}`);
        Object.keys(grouped[especialidad]).sort((a, b) => {
            const orden = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO'];
            return orden.indexOf(a) - orden.indexOf(b);
        }).forEach(anio => {
            const subAccordion = document.createElement('div');
            subAccordion.className = 'sub-accordion';
            
            const estudiantes = grouped[especialidad][anio];
            
            const headerDiv = document.createElement('div');
            headerDiv.className = 'sub-accordion-header';
            headerDiv.onclick = function() { toggleSubAccordion(this); };
            
            headerDiv.innerHTML = `
                <span>📅 Año ${anio} (${estudiantes.length} estudiantes)</span>
                <div>
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">+ Agregar</button>
                    <span style="margin-left: 10px;">▼</span>
                </div>
            `;
            
            const btnAgregar = headerDiv.querySelector('.btn-primary');
            btnAgregar.onclick = function(e) {
                e.stopPropagation();
                agregarEstudianteA(especialidad, anio);
            };
            
            subAccordion.appendChild(headerDiv);
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'sub-accordion-content';
            contentDiv.innerHTML = estudiantes.map(est => `
                <div class="estudiante-item">
                    <div>
                        <strong>${formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno)}</strong><br>
                        <small>📋 ${est.codigo_unico} | 🆔 ${formatearCampoOpcional(est.dni, 'Sin DNI')} | 📱 ${formatearCampoOpcional(est.celular, 'Sin celular')}</small>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-info" style="padding: 5px 10px; font-size: 11px;" onclick="editarEstudiante('${est.id}')">✏️</button>
                        <button class="btn-danger" style="padding: 5px 10px; font-size: 11px;" onclick="eliminarEstudiante('${est.id}', '${formatearNombreCompleto(est.nombre, est.apellido_paterno, est.apellido_materno).replace(/'/g, "\\'")}')">🗑️</button>
                    </div>
                </div>
            `).join('');
            
            subAccordion.appendChild(contentDiv);
            aniosContainer.appendChild(subAccordion);
        });
    });
}

async function eliminarEstudiante(estudianteId, nombreCompleto) {
    if (!confirm(`¿Eliminar a ${nombreCompleto}?\n\nEsta acción no se puede deshacer.`)) return;
    
    try {
        await tursodb.query('DELETE FROM estudiantes WHERE id = ?', [estudianteId]);
        alert('Estudiante eliminado correctamente');
        loadEstudiantesConEdicion();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

async function editarEstudiante(estudianteId) {
    try {
        const result = await tursodb.query('SELECT * FROM estudiantes WHERE id = ?', [estudianteId]);
        if (!result.rows || result.rows.length === 0) {
            alert('Estudiante no encontrado');
            return;
        }
        
        const estudiante = result.rows[0];
        
        hideAllSections();
        document.getElementById('editar-estudiante-section').classList.add('active');
        updateAllUserDropdowns();
        
        document.getElementById('edit-est-id').value = estudiante.id;
        document.getElementById('edit-form-especialidad').textContent = estudiante.especialidad;
        document.getElementById('edit-form-anio').textContent = estudiante.anio_formacion;
        document.getElementById('edit-est-codigo').value = estudiante.codigo_unico;
        document.getElementById('edit-est-dni').value = estudiante.dni;
        document.getElementById('edit-est-nombre').value = estudiante.nombre;
        document.getElementById('edit-est-apellido-paterno').value = estudiante.apellido_paterno;
        document.getElementById('edit-est-apellido-materno').value = estudiante.apellido_materno || '';
        document.getElementById('edit-est-celular').value = estudiante.celular || '';
        document.getElementById('edit-est-email').value = estudiante.email || '';
        document.getElementById('edit-est-password').value = estudiante.password || 'estudiante123';
    } catch (error) {
        alert('Error cargando estudiante: ' + error.message);
    }
}
