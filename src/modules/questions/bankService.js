import { DomainError } from '../../lib/errors.js';
import { log } from '../../lib/logger.js';
import { LOCK_IDS, loadBankFromFile, validateBank } from './questionBank.js';

/**
 * Banco de preguntas vigente. Fuente por defecto: data/questions.json.
 * Si el moderador lo edita desde el panel, la versión editada se guarda en el
 * almacén (Key Value o disco) y tiene prioridad hasta que se restaure el archivo.
 */
export class BankService {
  constructor({ store, file }) {
    this.store = store;
    this.file = file;
    this.current = null;
    this.source = 'archivo';
    this.warnings = [];
  }

  async init() {
    const fromFile = await loadBankFromFile(this.file);
    this.current = fromFile.bank;
    this.warnings = fromFile.warnings;
    this.source = 'archivo';
    try {
      const stored = await this.store.loadBank();
      if (stored) {
        const res = validateBank(stored);
        if (res.ok) {
          this.current = res.bank;
          this.warnings = res.warnings;
          this.source = 'panel';
        } else {
          log.warn('El banco guardado desde el panel es inválido; se usa el archivo.');
        }
      }
    } catch (err) {
      log.warn(`No se pudo leer el banco guardado: ${err.message}`);
    }
    log.info(`Banco de preguntas cargado desde ${this.source}: ${this.current.questions.length} preguntas.`);
  }

  get() {
    return this.current;
  }

  info() {
    return {
      source: this.source,
      warnings: this.warnings,
      perLock: LOCK_IDS.map((id) => ({
        lock: id,
        total: this.current.questions.filter((q) => q.lock === id).length,
        active: this.current.questions.filter((q) => q.lock === id && q.active).length,
      })),
    };
  }

  async save(raw) {
    const res = validateBank(raw);
    if (!res.ok) throw new DomainError(`El banco tiene errores:\n• ${res.errors.slice(0, 8).join('\n• ')}`);
    await this.store.saveBank(res.bank);
    this.current = res.bank;
    this.warnings = res.warnings;
    this.source = 'panel';
    return res;
  }

  async resetToFile() {
    const fromFile = await loadBankFromFile(this.file);
    await this.store.clearBank();
    this.current = fromFile.bank;
    this.warnings = fromFile.warnings;
    this.source = 'archivo';
  }
}
