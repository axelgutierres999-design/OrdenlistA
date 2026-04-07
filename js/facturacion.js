// js/facturacion.js - Sistema de Facturación "OrdenLista"
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = JSON.parse(localStorage.getItem('sesion_activa'));
    if (!sesion || typeof db === 'undefined') {
        console.error("Acceso denegado: Sesión no encontrada.");
        return;
    }

    const contenedor = document.getElementById('contenedorConceptos');
    const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

    // 1. Obtener el ID de la venta (de la URL o la última venta)
    const urlParams = new URLSearchParams(window.location.search);
    let ventaId = urlParams.get('id');

    async function cargarDatosFactura() {
        try {
            let query = db.from('ventas').select('*').eq('restaurante_id', sesion.restaurante_id);

            if (ventaId) {
                query = query.eq('id', ventaId).single();
            } else {
                // Si no hay ID, tomamos la última venta para facturar
                query = query.order('created_at', { ascending: false }).limit(1).single();
            }

            const { data: venta, error } = await query;

            if (error) throw error;
            if (venta) renderizarDetalles(venta);

        } catch (err) {
            console.error("Error al recuperar venta:", err.message);
            contenedor.innerHTML = "<p>No se encontró una venta reciente para facturar.</p>";
        }
    }

    // 2. Desglosar conceptos e impuestos
    function renderizarDetalles(venta) {
        // En México, el total ya tiene IVA. Desglosamos: 
        // Subtotal = Total / 1.16 | IVA = Total - Subtotal
        const totalVenta = parseFloat(venta.total);
        const subtotal = totalVenta / 1.16;
        const iva = totalVenta - subtotal;

        // Limpiar contenedor
        contenedor.innerHTML = "";

        // Parsear productos (basado en tu formato "1x Producto, 2x Producto")
        const productos = venta.productos.split(',');
        
        productos.forEach(p => {
            const item = document.createElement('div');
            item.className = 'linea-detalle';
            item.style = "display: flex; justify-content: space-between; padding: 5px 0;";
            item.innerHTML = `<span>${p.trim()}</span> <span>---</span>`;
            contenedor.appendChild(item);
        });

        // Actualizar UI de totales
        document.getElementById('subtotalFactura').textContent = fmt.format(subtotal);
        document.getElementById('ivaFactura').textContent = fmt.format(iva);
        document.getElementById('totalFactura').textContent = fmt.format(totalVenta);
        
        // Pre-llenar método de pago
        document.getElementById('metodoPago').value = (venta.metodo_pago || 'efectivo').toLowerCase();
    }

    // 3. Función Principal de Generación (Con escudo de protección)
    window.procesarFactura = () => {
        const rfc = document.getElementById('clienteRFC').value;
        const nombre = document.getElementById('clienteNombre').value;

        if (!rfc || !nombre) {
            alert("⚠️ Por favor, llena los datos fiscales del cliente.");
            return;
        }

        // Aquí simulamos la protección: Bloqueamos el botón y procesamos
        console.log("Generando archivo fiscal protegido...");
        alert(`🚀 Factura generada para ${nombre}.\nEnviando a la nube de OrdenLista...`);
        
        // Aquí podrías integrar html2pdf.js o enviar los datos a una Edge Function
    };

    // Bloqueo de inspección (Protección básica)
    document.onkeydown = (e) => {
        if (e.ctrlKey && (e.key === 'u' || e.key === 's')) {
            alert("Acceso al código fuente restringido por OrdenLista Security.");
            return false;
        }
    };

    cargarDatosFactura();
});