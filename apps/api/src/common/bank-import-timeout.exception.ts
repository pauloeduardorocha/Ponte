import { ServiceUnavailableException } from '@nestjs/common';

export class BankImportTimeoutException extends ServiceUnavailableException {
  constructor() {
    super(
      'A importação excedeu o tempo disponível para gravar os movimentos. Nenhum movimento desta tentativa foi gravado. Tente novamente.',
    );
  }
}
