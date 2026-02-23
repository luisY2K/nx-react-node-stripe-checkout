import '../src/styles/normalize.scss';
import '../src/styles/styles.scss';

import { Suspense } from 'react';
import { BrowserRouter } from 'react-router-dom';

import AppRouter from './router/AppRouter';
import Layout from './ui/Layout';
import Loading from './ui/Loading';

const CheckoutApp = () => {
  return (
    <Suspense fallback={<Loading />}>
      <BrowserRouter>
        <Layout>
          <AppRouter />
        </Layout>
      </BrowserRouter>
    </Suspense>
  );
};

export default CheckoutApp;
