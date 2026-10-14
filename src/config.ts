/** Datos públicos del proyecto Quorum. */
export const QUORUM = {
  website: 'https://quorumxrpl.com',
  /** Repositorio público del código (se completa al publicarlo). */
  sourceUrl: 'https://github.com/fcmdeveloper/quorum',
  publisher: 'Minify SpA',
  /**
   * Cuenta de donaciones en el XRP Ledger (mainnet). Mientras esté vacía,
   * la app no muestra la opción de donar.
   */
  donationAddress: 'rENjjwSdn7svgbFxJ17XrNUJmdGnpmfzFp',
  donationTag: undefined as number | undefined,
  /**
   * Galería pública de NFTs de Quorum (mainnet): cualquier usuario puede usar estas imágenes
   * para sus cuentas y bóvedas. Solo la cuenta decide qué NFTs tiene (en el XRP Ledger nadie
   * puede meterle un NFT sin que la cuenta lo acepte).
   */
  nftGalleryAddress: 'rfrn8qHd6qrYXokM1du4vEFF8qUin9kirE',
  /** Montos sugeridos en USD; se convierten a XRP con el precio actual y se redondean. */
  donationUsd: [5, 10, 25, 50],
  /** Monto especial: el "589" de la comunidad XRP Army. Opcional, aparece aparte. */
  donationArmyUsd: 589,
  /**
   * API key pública de la app "Quorum" en apps.xumm.dev. No es secreta: se usa como
   * client_id del inicio de sesión con Xaman (OAuth2 + PKCE). El API secret NUNCA va en la app.
   */
  xamanApiKey: 'dc41f66d-88c2-4606-92d3-9f6b5ff3df4a',
  /**
   * Redirect URI registrada en apps.xumm.dev (Xaman solo acepta https). Es una página
   * estática en quorumxrpl.com que reenvía el código de inicio de sesión a la app.
   */
  xamanRedirect: 'https://quorumxrpl.com/xaman-auth',
  /** Dirección a la que esa página devuelve el control (esquema propio de la app). */
  xamanAppCallback: 'quorum://xaman-auth',
};
