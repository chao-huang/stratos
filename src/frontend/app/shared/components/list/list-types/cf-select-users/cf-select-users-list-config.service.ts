import { Store } from '@ngrx/store';
import { combineLatest, Observable, of as observableOf } from 'rxjs';
import { distinctUntilChanged, map, publishReplay, refCount, switchMap, tap } from 'rxjs/operators';

import { ActiveRouteCfOrgSpace } from '../../../../../features/cloud-foundry/cf-page.types';
import { waitForCFPermissions } from '../../../../../features/cloud-foundry/cf.helpers';
import { ListView } from '../../../../../store/actions/list.actions';
import { AppState } from '../../../../../store/app-state';
import { APIResource } from '../../../../../store/types/api.types';
import { PaginatedAction } from '../../../../../store/types/pagination.types';
import { CfUser, CfUserMissingRoles } from '../../../../../store/types/user.types';
import { UserRoleLabels } from '../../../../../store/types/users-roles.types';
import { CfUserService } from '../../../../data-services/cf-user.service';
import { EntityMonitorFactory } from '../../../../monitors/entity-monitor.factory.service';
import { PaginationMonitor } from '../../../../monitors/pagination-monitor';
import { PaginationMonitorFactory } from '../../../../monitors/pagination-monitor.factory';
import { TableRowStateManager } from '../../list-table/table-row/table-row-state-manager';
import { ITableColumn } from '../../list-table/table.types';
import { IListConfig, IMultiListAction, ListViewTypes } from '../../list.component.types';
import { ListRowSateHelper } from '../../list.helper';
import { CfSelectUsersDataSourceService } from './cf-select-users-data-source.service';

function cfUserHasAllRoleProperties(user: APIResource<CfUser>): boolean {
  return !!user.entity.audited_organizations &&
    !!user.entity.billing_managed_organizations &&
    !!user.entity.managed_organizations &&
    !!user.entity.organizations &&
    !!user.entity.spaces &&
    !!user.entity.audited_spaces &&
    !!user.entity.managed_spaces;
}

export class CfSelectUsersListConfigService implements IListConfig<APIResource<CfUser>> {
  viewType = ListViewTypes.TABLE_ONLY;
  dataSource: CfSelectUsersDataSourceService;
  defaultView = 'table' as ListView;
  enableTextFilter = true;
  text = {
    title: null,
    filter: 'Search by name',
    noEntries: 'There are no users'
  };
  columns: ITableColumn<APIResource<CfUser>>[] = [
    {
      columnId: 'username',
      headerCell: () => 'Username',
      cellFlex: '10',
      cellAlignSelf: 'baseline',
      cellDefinition: {
        getValue: row => this.getUsername(row.entity)
      },
      sort: {
        type: 'sort',
        orderKey: 'username',
        field: 'entity.username'
      }
    }
  ];
  private initialised: Observable<boolean>;

  constructor(
    private store: Store<AppState>,
    private cfGuid: string,
    private cfUserService: CfUserService,
    private activeRouteCfOrgSpace: ActiveRouteCfOrgSpace,
    private paginationMonitorFactory: PaginationMonitorFactory,
    private entityMonitorFactory: EntityMonitorFactory
  ) {
    this.initialised = waitForCFPermissions(
      store,
      activeRouteCfOrgSpace.cfGuid
    ).pipe(
      switchMap(cf =>
        combineLatest(
          observableOf(cf),
          cfUserService.createPaginationAction(cf.global.isAdmin, true)
        )
      ),
      tap(([cf, action]) => this.createDataSource(action)),
      // tap(([cf, action]) => this.dataSource = new CfSelectUsersDataSourceService(this.cfGuid, this.store, action, this)),
      map(([cf]) => cf && cf.state.initialised),
      publishReplay(1),
      refCount()
    );
  }

  private cfUserRowStateSetUpManager(
    paginationMonitor: PaginationMonitor<APIResource<CfUser>>,
    entityMonitorFactory: EntityMonitorFactory,
    rowStateManager: TableRowStateManager,
    schemaKey: string
  ) {
    return paginationMonitor.currentPage$.pipe(
      distinctUntilChanged(),
      switchMap(entities => entities
        .map(entity => {
          const missingRoles = this.createMissingRoles(entity.entity.missingRoles);
          rowStateManager.updateRowState(entity.entity.guid, { warning: missingRoles.length });
        })
      ),
    ).subscribe();
  }

  private createDataSource(action: PaginatedAction) {
    const rowStateHelper = new ListRowSateHelper();
    const { rowStateManager, sub } = rowStateHelper.getRowStateManager(
      this.paginationMonitorFactory,
      this.entityMonitorFactory,
      action.paginationKey,
      action.entityKey,
      this.cfUserRowStateSetUpManager.bind(this)
    );
    this.dataSource = new CfSelectUsersDataSourceService(this.cfGuid, this.store, action, this, rowStateManager, () => {
      sub.unsubscribe();
    });
  }

  private getUsername = (user: CfUser): string => {
    const userName = user.username || user.guid;
    const missingRoles = this.createMissingRoles(user.missingRoles);
    if (missingRoles.length) {
      return `${userName} - Not all roles could be discovered (${missingRoles.join(', ')}). If you continue with this user their roles will
      not be accurately shown. Please navigate to a specific organization or space to ensure accurate roles are displayed`;
    }
    return userName;
  }

  private createMissingRoles(missingRoles: CfUserMissingRoles): string[] {
    if (missingRoles) {
      if (this.activeRouteCfOrgSpace.spaceGuid) {
        // At space level, we'll have all the org and space roles
        return [];
      } else if (this.activeRouteCfOrgSpace.orgGuid) {
        // At org level, we'll have all the org but possibly not space roles
        return missingRoles.space.map(role => UserRoleLabels.space.long[role]);
      } else {
        // At cf level, we might not have either org or space roles
        return [].concat(
          missingRoles.org.map(role => UserRoleLabels.org.long[role]),
          missingRoles.space.map(role => UserRoleLabels.space.long[role]));
      }
    }
  }

  getColumns = () => this.columns;
  getGlobalActions = () => [];
  getMultiActions = (): IMultiListAction<APIResource<CfUser>>[] => [
    {
      label: 'delete me',
      description: '',
      action: (items: APIResource<CfUser>[]) => false
    }
  ]
  getSingleActions = () => [];
  getMultiFiltersConfigs = () => [];
  getDataSource = () => this.dataSource;
  getInitialised = () => this.initialised;
}
