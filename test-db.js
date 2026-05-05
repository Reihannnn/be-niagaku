


// const mysql = require('mysql2') // kalau MySQL
import { Client } from 'pg'
import dotenv from "dotenv"

dotenv.config()

const client = new Client({
  connectionString: process.env.DATABASE_URL
})

console.log(process.env.DATABASE_URL)

async function testDB() {
  try {
    await client.connect()
    console.log("✅ Database connected!")

    const res = await client.query('SELECT NOW()')
    console.log("⏰ Waktu DB:", res.rows[0])

    await client.end()
  } catch (err) {
    console.error("❌ Gagal connect:", err.message)
  }
}

testDB()