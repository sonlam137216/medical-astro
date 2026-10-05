// Set by src/middleware.ts for every signed-in /admin request.
declare namespace App {
  interface Locals {
    admin: import('./lib/admin-auth').AdminUser;
    db: import('./lib/admin-auth').AdminDb;
  }
}
