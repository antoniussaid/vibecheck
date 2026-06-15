import { useEffect, useState } from 'react';

/**
 * VibeCheck Demo Shop — a deliberately flawed fixture.
 *
 * This is NOT a portfolio app. It is a controlled test target for VibeCheck.
 * Every defect below is intentional and documented in
 * docs/DEMO_FIXTURE_DEFECTS.md so the scanner has real, reproducible evidence
 * to capture. Do not "fix" these defects.
 */

const PRODUCT_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
       <rect width="320" height="200" fill="#e8edf4"/>
       <rect x="24" y="120" width="180" height="14" rx="7" fill="#c2ccda"/>
       <circle cx="80" cy="70" r="34" fill="#aab8cc"/>
     </svg>`,
  );

interface Product {
  id: number;
  name: string;
  price: string;
}

const PRODUCTS: Product[] = [
  { id: 1, name: 'Aero Desk Lamp', price: '€49' },
  { id: 2, name: 'Field Notebook', price: '€18' },
  { id: 3, name: 'Ceramic Pour-Over', price: '€34' },
  { id: 4, name: 'Linen Apron', price: '€42' },
];

export function App(): JSX.Element {
  const [email, setEmail] = useState('');

  useEffect(() => {
    // DEFECT 2: deliberate console.error on mount.
    console.error('VibeCheck demo: simulated runtime error while computing cart total.');

    // DEFECT 3a: request to a missing local endpoint -> HTTP 404.
    void fetch('/api/products').catch(() => {
      /* swallowed: the failure is the point */
    });

    // DEFECT 3b: request that fails at the network level (server resets socket).
    void fetch('/__vibecheck/dead').catch(() => {
      /* swallowed: the failure is the point */
    });

    // DEFECT 6 (bonus): uncaught runtime error -> page error event.
    setTimeout(() => {
      throw new Error('VibeCheck demo: simulated uncaught error in analytics handler.');
    }, 50);
  }, []);

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ◆
          </span>
          <span className="brand__name">Demo Shop</span>
        </div>
        <nav className="nav" aria-label="Primary">
          <a href="#catalog">Catalog</a>
          <a href="#newsletter">Newsletter</a>
        </nav>
      </header>

      <main>
        {/* DEFECT 1: fixed-width element wider than small viewports -> horizontal overflow.
            Kept inside <main> so it is contained by a landmark (no spurious axe "region"). */}
        <div className="wide-banner">
          Spring sale — free shipping on all orders over €30, this week only across the entire store
        </div>

        <section id="catalog" className="catalog">
          <h1 className="catalog__title">New this season</h1>
          <p className="catalog__lede">A small, calm catalog used as a controlled scan target.</p>
          <ul className="grid">
            {PRODUCTS.map((product) => (
              <li key={product.id} className="card">
                {/* DEFECT 5: image without an alt attribute. */}
                <img className="card__image" src={PRODUCT_IMAGE} />
                <div className="card__body">
                  <h2 className="card__name">{product.name}</h2>
                  <span className="card__price">{product.price}</span>
                </div>
                <button className="card__cta" type="button">
                  Add to cart
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section id="newsletter" className="newsletter">
          <h2>Stay in the loop</h2>
          <p>Get a note when new pieces land.</p>
          <form
            className="newsletter__form"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            {/* DEFECT 4: text input with no associated label, no aria-label/labelledby,
                no title, and no placeholder. A placeholder would give Chromium an
                accessible name and suppress the axe `label` rule, so it is omitted
                on purpose to reliably trigger `label`. */}
            <input
              className="newsletter__input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="newsletter__submit" type="submit">
              Subscribe
            </button>
          </form>
        </section>
      </main>

      <footer className="footer">
        <span>VibeCheck Demo Shop — controlled test fixture</span>
      </footer>
    </div>
  );
}
