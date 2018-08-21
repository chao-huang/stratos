import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Params, RouterStateSnapshot } from '@angular/router';
import { RouterStateSerializer, StoreRouterConnectingModule } from '@ngrx/router-store';
import { AppComponent } from './app.component';
import { RouteModule } from './app.routing';
import { CoreModule } from './core/core.module';
import { CustomModule } from './custom.module';
import { AboutModule } from './features/about/about.module';
import { ApplicationsModule } from './features/applications/applications.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { HomeModule } from './features/home/home.module';
import { LoginModule } from './features/login/login.module';
import { NoEndpointsNonAdminComponent } from './features/no-endpoints-non-admin/no-endpoints-non-admin.component';
import { ServiceCatalogModule } from './features/service-catalog/service-catalog.module';
import { SetupModule } from './features/setup/setup.module';
import { LoggedInService } from './logged-in.service';
import { SharedModule } from './shared/shared.module';
import { AppStoreModule } from './store/store.module';
import { PageNotFoundComponentComponent } from './core/page-not-found-component/page-not-found-component.component';
import { XSRFModule } from './xsrf.module';
import { listCardComponents } from './shared/components/list/list-cards/card.types';
import { TableCellDefaultComponent } from './shared/components/list/list-table/app-table-cell-default/app-table-cell-default.component';
import { TableCellEndpointStatusComponent } from './shared/components/list/list-types/endpoint/table-cell-endpoint-status/table-cell-endpoint-status.component';
import { TableCellActionsComponent } from './shared/components/list/list-table/table-cell-actions/table-cell-actions.component';
import { TableCellEndpointNameComponent } from './shared/components/list/list-types/endpoint/table-cell-endpoint-name/table-cell-endpoint-name.component';
import { TableCellAppNameComponent } from './shared/components/list/list-types/app/table-cell-app-name/table-cell-app-name.component';
import { TableCellAppStatusComponent } from './shared/components/list/list-types/app/table-cell-app-status/table-cell-app-status.component';


// Create action for router navigation. See
// - https://github.com/ngrx/platform/issues/68
// - https://github.com/ngrx/platform/issues/201 (https://github.com/ngrx/platform/pull/355)

// https://github.com/ngrx/platform/blob/master/docs/router-store/api.md#custom-router-state-serializer
export interface RouterStateUrl {
  url: string;
  params: Params;
  queryParams: Params;
}
export class CustomRouterStateSerializer
  implements RouterStateSerializer<RouterStateUrl> {
  serialize(routerState: RouterStateSnapshot): RouterStateUrl {
    let route = routerState.root;
    while (route.firstChild) {
      route = route.firstChild;
    }

    const { url } = routerState;
    const queryParams = routerState.root.queryParams;
    const params = route.params;

    // Only return an object including the URL, params and query params
    // instead of the entire snapshot
    return { url, params, queryParams };
  }
}

/**
 * `HttpXsrfTokenExtractor` which retrieves the token from a cookie.
 */

@NgModule({
  declarations: [
    AppComponent,
    NoEndpointsNonAdminComponent,
    PageNotFoundComponentComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CoreModule,
    AppStoreModule,
    SharedModule,
    RouteModule,
    ApplicationsModule,
    SetupModule,
    LoginModule,
    HomeModule,
    DashboardModule,
    ServiceCatalogModule,
    StoreRouterConnectingModule, // Create action for router navigation
    AboutModule,
    CustomModule,
    XSRFModule,
  ],
  entryComponents: [
    ...listCardComponents,
    TableCellDefaultComponent,
    TableCellEndpointStatusComponent,
    TableCellActionsComponent,
    TableCellEndpointNameComponent,
    TableCellAppNameComponent,
    TableCellAppStatusComponent
  ],
  providers: [
    LoggedInService,
    { provide: RouterStateSerializer, useClass: CustomRouterStateSerializer } // Create action for router navigation
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
