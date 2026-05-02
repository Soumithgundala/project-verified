import db from '../db/database.js';
console.log('fingerprint_index schema:');
console.log(db.prepare('PRAGMA table_info(fingerprint_index)').all());
console.log('file_metadata schema:');
console.log(db.prepare('PRAGMA table_info(file_metadata)').all());
console.log('quarantine_queue schema:');
console.log(db.prepare('PRAGMA table_info(quarantine_queue)').all());
process.exit(0);
