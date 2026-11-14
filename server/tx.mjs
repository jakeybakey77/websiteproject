// One transaction owner per SQLite handle. Every store that writes through the
// same connection shares this helper, so a call made while another store already
// holds the transaction joins it instead of issuing a nested BEGIN (which SQLite
// rejects). The outermost call commits or rolls back the whole unit of work.
export function createTx(db) {
  let depth = 0;
  return function tx(fn) {
    if (depth > 0) return fn();
    db.exec('BEGIN IMMEDIATE');
    depth += 1;
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      depth -= 1;
    }
  };
}
