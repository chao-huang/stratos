import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, of as observableOf } from 'rxjs';
import { combineLatest, first, map } from 'rxjs/operators';

import {
  UsersRolesClear,
  UsersRolesExecuteChanges,
  UsersRolesSetChanges,
  UsersRolesSetUsers,
} from '../../../../../../store/src/actions/users-roles.actions';
import { AppState } from '../../../../../../store/src/app-state';
import { selectUsersRoles } from '../../../../../../store/src/selectors/users-roles.selector';
import { CfUser, IUserPermissionInOrg, IUserPermissionInSpace } from '../../../../../../store/src/types/user.types';
import { StepOnNextFunction } from '../../../../shared/components/stepper/step/step.component';
import { CfUserService } from '../../../../shared/data-services/cf-user.service';
import { ActiveRouteCfOrgSpace } from '../../cf-page.types';
import { getActiveRouteCfOrgSpaceProvider } from '../../cf.helpers';
import { CfRolesService } from '../manage-users/cf-roles.service';
import { LoggerService } from '../../../../core/logger.service';


@Component({
  selector: 'app-remove-user',
  templateUrl: './remove-user.component.html',
  styleUrls: ['./remove-user.component.scss'],
  providers: [
    getActiveRouteCfOrgSpaceProvider,
    CfUserService,
    CfRolesService
  ]
})
export class RemoveUserComponent implements OnDestroy {
  initialUsers$: Observable<CfUser[]>;
  singleUser$: Observable<CfUser>;
  defaultCancelUrl: string;
  orgGuid: string;
  spaceGuid: string;
  applyStarted = false;
  onlySpaces = false;

  constructor(
    private store: Store<AppState>,
    private activeRouteCfOrgSpace: ActiveRouteCfOrgSpace,
    private cfUserService: CfUserService,
    private cfRolesService: CfRolesService,
    private logService: LoggerService,
    private route: ActivatedRoute
  ) {
    this.defaultCancelUrl = this.createReturnUrl(activeRouteCfOrgSpace);
    this.orgGuid = this.activeRouteCfOrgSpace.orgGuid;
    this.spaceGuid = this.activeRouteCfOrgSpace.spaceGuid;
    this.onlySpaces = this.route.snapshot.queryParamMap.get('spaces') === 'true';

    const userQParam = this.route.snapshot.queryParamMap.get('user');
    if (userQParam) {
      this.singleUser$ = this.cfUserService.getUser(activeRouteCfOrgSpace.cfGuid, userQParam)
        .pipe(
          map(user => user.entity),
        );
    } else {
      this.logService.error('User param not defined');
      return;
    }

    // Ensure that when we arrive here directly the store is set up with all it needs
    this.store.select(selectUsersRoles).pipe(
      combineLatest(this.singleUser$),
      first()
    ).subscribe(([usersRoles, user]) => {
      if (!usersRoles.cfGuid || !user) {
        this.store.dispatch(new UsersRolesSetUsers(activeRouteCfOrgSpace.cfGuid, [user]));
      }
    });

    this.cfRolesService.existingRoles$.pipe(
      combineLatest(this.singleUser$),
      first(),
    ).subscribe(([existingRoles, user]) => {
      const orgs = existingRoles[user.guid];
      const changes = this.getRolesChanges(user, orgs);

      this.store.dispatch(new UsersRolesSetChanges(changes));
    });
  }

  ngOnDestroy(): void {
    this.store.dispatch(new UsersRolesClear());
  }

  getRolesChanges(user: CfUser, orgs) {
    const changes = [];
    const orgGuids = this.orgGuid ? [this.orgGuid] : Object.keys(orgs);

    for (const orgGuid of orgGuids) {
      const org: IUserPermissionInOrg = orgs[orgGuid];

      changes.push(...this.getOrgRolesChanges(user, org));
      changes.push(...this.getSpacesRolesChanges(user, org.spaces));
    }

    return changes;
  }

  getOrgRolesChanges(user: CfUser, org: IUserPermissionInOrg) {
    const changes = [];

    if (!this.spaceGuid && !this.onlySpaces) {
      const roles = org.permissions;

      for (const role of Object.keys(roles)) {
        const assigned = roles[role];

        if (assigned) {
          changes.push({
            userGuid: user.guid,
            orgGuid: org.orgGuid,
            orgName: org.name,
            add: false,
            role,
          });
        }
      }
    }

    return changes;
  }

  getSpacesRolesChanges(user: CfUser, spaces) {
    const changes = [];
    const spaceGuids = this.spaceGuid ? [this.spaceGuid] : Object.keys(spaces);

    for (const spaceGuid of spaceGuids) {
      const space: IUserPermissionInSpace = spaces[spaceGuid];
      const roles = space.permissions;

      for (const role of Object.keys(roles)) {
        const assigned = roles[role];

        if (assigned) {
          changes.push({
            userGuid: user.guid,
            orgGuid: space.orgGuid,
            orgName: space.orgName,
            spaceGuid,
            spaceName: space.name,
            add: false,
            role,
          });
        }
      }
    }

    return changes;
  }

  /**
   * Determine where the return url should be. This will only apply when user visits modal directly (otherwise stepper uses previous state)
   */
  createReturnUrl(activeRouteCfOrgSpace: ActiveRouteCfOrgSpace): string {
    let route = `/cloud-foundry/${activeRouteCfOrgSpace.cfGuid}`;
    if (this.activeRouteCfOrgSpace.orgGuid) {
      route += `/organizations/${activeRouteCfOrgSpace.orgGuid}`;
      if (this.activeRouteCfOrgSpace.spaceGuid) {
        route += `/spaces/${activeRouteCfOrgSpace.spaceGuid}`;
      }
    }
    route += `/users`;
    return route;
  }

  startApply: StepOnNextFunction = () => {
    if (this.applyStarted) {
      return observableOf({ success: true, redirect: true });
    }
    this.applyStarted = true;
    this.store.dispatch(new UsersRolesExecuteChanges());
    return observableOf({ success: true, ignoreSuccess: true });
  }
}
