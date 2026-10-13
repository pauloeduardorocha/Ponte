import { ServiceUnavailableException } from '@nestjs/common';

// Only fixed, application-owned messages may be exposed by the exception filter.
export class EfaturaUnavailableException extends ServiceUnavailableException {
  constructor(
    reason:
      'missing' | 'launch' | 'browser' | 'portal' | 'timeout' | 'incomplete',
  ) {
    const messages = {
      missing: 'O serviço de consulta ao e-Fatura não está instalado.',
      launch: 'Não foi possível iniciar a consulta ao e-Fatura.',
      browser:
        'O navegador de consulta não está disponível. Verifique a instalação do serviço.',
      portal:
        'Não foi possível consultar as faturas. Confira o NIF e a senha. O portal pode exigir MFA ou CAPTCHA.',
      timeout: 'A consulta ao e-Fatura demorou demasiado. Tente novamente.',
      incomplete: 'A consulta ao e-Fatura não foi concluída.',
    };
    super(messages[reason]);
  }
}
