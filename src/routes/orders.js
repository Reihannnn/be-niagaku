const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/orders
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = ['o.store_id = $1'];
    let params = [req.user.store_id];
    let paramIndex = 2;

    if (status) {
      const statuses = status.split(',');
      conditions.push(`o.status = ANY($${paramIndex++}::order_status[])`);
      params.push(statuses);
    }

    if (date) {
      conditions.push(`DATE(o.ordered_at) = $${paramIndex++}`);
      params.push(date);
    } else {
      // Default: today
      conditions.push(`DATE(o.ordered_at) = CURRENT_DATE`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM orders o WHERE ${whereClause}`,
      params
    );

    params.push(limit, offset);
    const result = await query(
      `SELECT o.*,
              t.label as table_label,
              u.name as cashier_name,
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'quantity', oi.quantity,
                  'price_snapshot', oi.price_snapshot,
                  'notes', oi.notes
                ) ORDER BY oi.id
              ) as items
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN users u ON o.cashier_id = u.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE ${whereClause}
       GROUP BY o.id, t.label, u.name
       ORDER BY o.ordered_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/orders/live - for realtime dashboard
router.get('/live', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*,
              t.label as table_label,
              u.name as cashier_name,
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_name', p.name,
                  'quantity', oi.quantity,
                  'price_snapshot', oi.price_snapshot,
                  'notes', oi.notes
                ) ORDER BY oi.id
              ) as items
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN users u ON o.cashier_id = u.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.store_id = $1
         AND o.status NOT IN ('COMPLETED', 'CANCELLED')
         AND DATE(o.ordered_at) = CURRENT_DATE
       GROUP BY o.id, t.label, u.name
       ORDER BY o.ordered_at DESC`,
      [req.user.store_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get live orders error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT o.*,
              t.label as table_label,
              u.name as cashier_name,
              json_agg(
                json_build_object(
                  'id', oi.id,
                  'product_id', oi.product_id,
                  'product_name', p.name,
                  'quantity', oi.quantity,
                  'price_snapshot', oi.price_snapshot,
                  'notes', oi.notes
                ) ORDER BY oi.id
              ) as items
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN users u ON o.cashier_id = u.id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.id = $1 AND o.store_id = $2
       GROUP BY o.id, t.label, u.name`,
      [req.params.id, req.user.store_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/orders - create order by kasir
router.post('/', authenticate, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { table_id, items, customer_name, customer_note, payment_method } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Pesanan harus memiliki minimal 1 item' });
    }

    // Get daily number
    const dailyResult = await client.query(
      `SELECT COALESCE(MAX(daily_number), 0) + 1 as next_number
       FROM orders
       WHERE store_id = $1 AND DATE(ordered_at) = CURRENT_DATE`,
      [req.user.store_id]
    );
    const daily_number = dailyResult.rows[0].next_number;

    // Calculate total and validate products
    let total_amount = 0;
    const validatedItems = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, price, name, status FROM products WHERE id = $1 AND store_id = $2',
        [item.product_id, req.user.store_id]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Produk tidak ditemukan: ${item.product_id}`);
      }

      const product = productResult.rows[0];
      if (product.status === 'OUT_OF_STOCK') {
        throw new Error(`Produk "${product.name}" sedang habis`);
      }

      total_amount += product.price * item.quantity;
      validatedItems.push({
        product_id: product.id,
        quantity: item.quantity,
        price_snapshot: product.price,
        notes: item.notes || null
      });
    }

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (store_id, table_id, cashier_id, daily_number, source, status, payment_method, total_amount, customer_name, customer_note)
       VALUES ($1, $2, $3, $4, 'KASIR', $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.user.store_id,
        table_id || null,
        req.user.id,
        daily_number,
        payment_method === 'CASH' ? 'PENDING_CASH' : 'WAITING_PAYMENT',
        payment_method || null,
        total_amount,
        customer_name || null,
        customer_note || null
      ]
    );

    const order = orderResult.rows[0];

    // Insert order items
    for (const item of validatedItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_snapshot, notes) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.product_id, item.quantity, item.price_snapshot, item.notes]
      );
    }

    // Update table status if table_id provided
    if (table_id) {
      await client.query('UPDATE tables SET status = $1 WHERE id = $2', ['OCCUPIED', table_id]);
    }

    await client.query('COMMIT');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(req.user.store_id).emit('new_order', { order_id: order.id, daily_number: order.daily_number });
    }

    res.status(201).json({ success: true, message: 'Pesanan berhasil dibuat', data: order });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create order error:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/orders/self - create order by customer via QR
router.post('/self', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { qr_token, items, customer_name, customer_note, payment_method } = req.body;

    if (!qr_token) {
      return res.status(400).json({ success: false, message: 'QR token diperlukan' });
    }

    const tableResult = await client.query(
      `SELECT t.*, s.is_open FROM tables t JOIN stores s ON t.store_id = s.id WHERE t.qr_token = $1`,
      [qr_token]
    );

    if (tableResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan' });
    }

    const table = tableResult.rows[0];
    if (!table.is_open) {
      return res.status(400).json({ success: false, message: 'Toko sedang tutup' });
    }

    const store_id = table.store_id;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Pesanan harus memiliki minimal 1 item' });
    }

    const dailyResult = await client.query(
      `SELECT COALESCE(MAX(daily_number), 0) + 1 as next_number FROM orders WHERE store_id = $1 AND DATE(ordered_at) = CURRENT_DATE`,
      [store_id]
    );
    const daily_number = dailyResult.rows[0].next_number;

    let total_amount = 0;
    const validatedItems = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, price, name, status FROM products WHERE id = $1 AND store_id = $2',
        [item.product_id, store_id]
      );

      if (productResult.rows.length === 0 || productResult.rows[0].status === 'OUT_OF_STOCK') {
        throw new Error(`Produk tidak tersedia`);
      }

      const product = productResult.rows[0];
      total_amount += product.price * item.quantity;
      validatedItems.push({
        product_id: product.id,
        quantity: item.quantity,
        price_snapshot: product.price,
        notes: item.notes || null
      });
    }

    const orderStatus = payment_method === 'CASH' ? 'PENDING_CASH' : 'WAITING_PAYMENT';

    const orderResult = await client.query(
      `INSERT INTO orders (store_id, table_id, daily_number, source, status, payment_method, total_amount, customer_name, customer_note)
       VALUES ($1, $2, $3, 'SELF_ORDER', $4, $5, $6, $7, $8) RETURNING *`,
      [store_id, table.id, daily_number, orderStatus, payment_method || null, total_amount, customer_name || null, customer_note || null]
    );

    const order = orderResult.rows[0];

    for (const item of validatedItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_snapshot, notes) VALUES ($1, $2, $3, $4, $5)',
        [order.id, item.product_id, item.quantity, item.price_snapshot, item.notes]
      );
    }

    await client.query('UPDATE tables SET status = $1 WHERE id = $2', ['OCCUPIED', table.id]);
    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(store_id).emit('new_order', { order_id: order.id, daily_number: order.daily_number });
    }

    res.status(201).json({ success: true, message: 'Pesanan berhasil dibuat', data: { order_id: order.id, daily_number: order.daily_number, total_amount: order.total_amount } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Self order error:', error);
    res.status(400).json({ success: false, message: error.message || 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status - update order status
router.patch('/:id/status', authenticate, async (req, res) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['WAITING_PAYMENT', 'PENDING_CASH', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND store_id = $2',
      [id, req.user.store_id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
    }

    const order = existing.rows[0];
    let extraFields = '';
    const updateParams = [status, id, req.user.store_id];

    if (status === 'COMPLETED') {
      extraFields = ', completed_at = NOW()';
      // Free up table
      if (order.table_id) {
        await client.query('UPDATE tables SET status = $1 WHERE id = $2', ['AVAILABLE', order.table_id]);
      }
    }

    if (status === 'CANCELLED' && order.table_id) {
      await client.query('UPDATE tables SET status = $1 WHERE id = $2', ['AVAILABLE', order.table_id]);
    }

    const result = await client.query(
      `UPDATE orders SET status = $1${extraFields} WHERE id = $2 AND store_id = $3 RETURNING *`,
      updateParams
    );

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) {
      io.to(req.user.store_id).emit('order_updated', { order_id: id, status });
    }

    res.json({ success: true, message: 'Status pesanan diupdate', data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;