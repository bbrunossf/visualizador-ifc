/**
 * O pacote @xeokit/xeokit-sdk não publica tipos para o bundle ES que o viewer
 * carrega dinamicamente no navegador (o build CJS tem `main`, mas o navegador
 * precisa da build ES). Sem esta declaração o TypeScript recusa o import.
 */
declare module "@xeokit/xeokit-sdk/dist/xeokit-sdk.es.js";
