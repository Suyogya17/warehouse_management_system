require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

async function exportDatabase() {
  console.log('🚀 Starting database export...\n');
  
  try {
    // Get all table names
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const [tables] = await pool.query(tablesQuery);
    
    let sqlContent = '';
    sqlContent += '-- Database Export for store_db\n';
    sqlContent += `-- Exported on: ${new Date().toISOString()}\n\n`;
    
    // Export each table
    for (const { table_name } of tables) {
      console.log(`📊 Exporting table: ${table_name}`);
      
      // Get table structure
      const structureQuery = `
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ordinal_position;
      `;
      const [columns] = await pool.query(structureQuery, [table_name]);
      
      // Create DROP and CREATE statements
      sqlContent += `\n-- Table: ${table_name}\n`;
      sqlContent += `DROP TABLE IF EXISTS \`${table_name}\`;\n`;
      sqlContent += `CREATE TABLE ${table_name} (\n`;
      
      const columnDefs = columns.map(col => {
        let def = `  ${col.column_name} ${col.data_type}`;
        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        return def;
      });
      
      sqlContent += columnDefs.join(',\n');
      sqlContent += '\n);\n\n';
      
      // Get table data
      const dataQuery = `SELECT * FROM \`${table_name}\``;
      const [data] = await pool.query(dataQuery);
      
      if (data.length > 0) {
        sqlContent += `-- Data for ${table_name}\n`;
        
        for (const row of data) {
          const cols = Object.keys(row);
          const vals = Object.values(row).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') {
              return `'${val.replace(/'/g, "''")}'`;
            }
            if (val instanceof Date) {
              return `'${val.toISOString()}'`;
            }
            if (typeof val === 'boolean') {
              return val ? 'true' : 'false';
            }
            return val;
          });
          
          sqlContent += `INSERT INTO \`${table_name}\` (${cols.map((col) => `\`${col}\``).join(', ')}) VALUES (${vals.join(', ')});\n`;
        }
        sqlContent += '\n';
      }
      
      console.log(`✅ Exported ${data.length} rows from ${table_name}`);
    }
    
    // Save to file
    const filePath = require('os').homedir() + '/Desktop/store_db_backup.sql';
    fs.writeFileSync(filePath, sqlContent, 'utf8');
    
    console.log('\n🎉 SUCCESS! Database exported to:');
    console.log(`📁 ${filePath}`);
    console.log(`📊 Total tables: ${tables.length}`);
    
  } catch (error) {
    console.error('❌ Error exporting database:', error.message);
  } finally {
    await pool.end();
  }
}

exportDatabase();
