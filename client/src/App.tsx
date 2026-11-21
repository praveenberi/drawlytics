import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { Layout } from '@/components/Layout';
import Home from '@/pages/Home';
import Countries from '@/pages/Countries';
import Lotteries from '@/pages/Lotteries';
import LotteryDetail from '@/pages/LotteryDetail';
import { HistoricalResults, LatestResults, SearchPage } from '@/pages/Results';
import Analysis from '@/pages/Analysis';
import Suggestions from '@/pages/Suggestions';
import { About, AuthPage, NotFound } from '@/pages/Static';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminLotteries from '@/pages/admin/Lotteries';
import AdminCatalog from '@/pages/admin/Catalog';
import AdminResults from '@/pages/admin/Results';
import AdminUpload from '@/pages/admin/Upload';
import AdminFormulas from '@/pages/admin/Formulas';
import { AdminAlgorithms, AdminAudit, AdminPerformance, AdminUsers } from '@/pages/admin/System';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="countries" element={<Countries />} />
            <Route path="lotteries" element={<Lotteries />} />
            <Route path="lotteries/:id" element={<LotteryDetail />} />
            <Route path="results/latest" element={<LatestResults />} />
            <Route path="results/history" element={<HistoricalResults />} />
            <Route path="analysis" element={<Analysis />} />
            <Route path="suggestions" element={<Suggestions />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="about" element={<About />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="lotteries" element={<AdminLotteries />} />
              <Route path="countries" element={<AdminCatalog />} />
              <Route path="results" element={<AdminResults />} />
              <Route path="upload" element={<AdminUpload />} />
              <Route path="formulas" element={<AdminFormulas />} />
              <Route path="algorithms" element={<AdminAlgorithms />} />
              <Route path="performance" element={<AdminPerformance />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="audit" element={<AdminAudit />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
}
