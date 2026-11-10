# Medição do bundle do frontend

Na raiz do repositório:

```sh
npm run build:report --workspace @church/web
```

O comando verifica TypeScript, compila para produção e informa tamanhos brutos e gzip. O JavaScript inicial inclui a entrada e seus imports estáticos transitivos pelo manifesto Vite; imports dinâmicos entram somente no total. Cada arquivo é comprimido separadamente. CSS, worker PDF e arquivos do service worker ficam fora dessas duas medidas.

Compare builds do mesmo ambiente e dependências e registre o commit medido. Números de builds antigos não representam o peso atual.

Rotas usam carregamento sob demanda e ícones MUI usam entradas individuais. Gráficos e mapas também podem produzir chunks próprios. O PWA pode pré-carregar JavaScript sob demanda em segundo plano; tamanho inicial não é o tráfego total da primeira visita. Um build aprovado pode emitir aviso de chunk grande; meça o relatório antes de definir a próxima otimização.
