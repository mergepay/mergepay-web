import React from 'react';

export function MobileNav() {
  return (
    <nav className="flex justify-around items-center h-16 w-full fixed bottom-0 bg-white border-t sm:hidden">
      <button className="min-h-12 min-w-12 flex items-center justify-center p-2 text-lg">
        Home
      </button>
      <button className="min-h-12 min-w-12 flex items-center justify-center p-2 text-lg">
        Dashboard
      </button>
      <button className="min-h-12 min-w-12 flex items-center justify-center p-2 text-lg">
        Settings
      </button>
    </nav>
  );
}
