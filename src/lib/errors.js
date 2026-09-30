/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DomainError';
  }
}
