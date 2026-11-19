import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Lounge ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('cavannghe_deco_items');
    } catch (e) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen bg-[#0e0c0b] flex flex-col items-center justify-center p-6 text-center text-amber-100 font-sans">
          <div className="p-6 rounded-3xl bg-amber-950/40 border border-amber-500/30 max-w-md shadow-2xl backdrop-blur-md">
            <h2 className="text-xl font-bold font-serif text-amber-200 mb-2">
              Ca Văn Nghệ 3D
            </h2>
            <p className="text-xs text-amber-300/70 mb-4">
              Đã xảy ra sự cố khi tải không gian 3D ({this.state.error?.message || 'Lỗi không xác định'}).
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-amber-500 text-stone-900 font-bold text-xs shadow-md hover:bg-amber-400 transition"
              >
                Tải lại trang
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-white/10 text-amber-200 text-xs font-medium hover:bg-white/20 transition"
              >
                Khôi phục mặc định
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
