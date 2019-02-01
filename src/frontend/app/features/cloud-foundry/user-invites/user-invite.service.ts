import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material';
import { Store } from '@ngrx/store';
import { combineLatest, Observable, of as observableOf } from 'rxjs';
import { catchError, filter, map, switchMap } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';
import { CurrentUserPermissions } from '../../../core/current-user-permissions.config';
import { CurrentUserPermissionsService } from '../../../core/current-user-permissions.service';
import { GetSystemInfo } from '../../../store/actions/system.actions';
import { AppState } from '../../../store/app-state';
import { waitForCFPermissions } from '../cf.helpers';
import { CloudFoundryEndpointService } from '../services/cloud-foundry-endpoint.service';

const { proxyAPIVersion } = environment;

export interface UserInviteResponse {
  error: boolean;
  errorMessage?: string;
}

export interface UserInviteSendUaaResponse {
  failed_invites: UserInviteSendUaaSectionResponse[];
  new_invites: UserInviteSendUaaSectionResponse[];
}

export interface UserInviteSendUaaSectionResponse {
  email: string;
  errorCode: string;
  errorMessage: string;
  inviteLink: string;
  success: boolean;
  userid: string;
}

export interface UserInviteSendResponse extends UserInviteResponse, UserInviteSendUaaResponse {
}

export enum UserInviteSendSpaceRoles {
  developer = 'developer',
  auditor = 'auditor',
  manager = 'manager'
}

interface UserInviteSendRequest {
  org: string;
  space: string;
  spaceRoles: { [spaceRole: string]: boolean };
  emails: string[];
}

@Injectable()
export class UserInviteService {

  configured$: Observable<boolean>;
  enabled$: Observable<boolean>;

  constructor(
    private store: Store<AppState>,
    private http: HttpClient,
    private snackBar: MatSnackBar,
    cfEndpointService: CloudFoundryEndpointService,
    private currentUserPermissionsService: CurrentUserPermissionsService
  ) {
    // TODO: RC Should all users be allowed to configure?
    // waitForCFPermissions(this.store, this.activeRouteCfOrgSpace.cfGuid).pipe(
    //   map(cf => cf.global.isAdmin) <--- for admin
    this.configured$ = cfEndpointService.endpoint$.pipe(
      filter(v => !!v.entity && !!v.entity.metadata),
      map(v => v.entity && v.entity.metadata['userInviteAllowed'] === 'true'), // TODO: add to typing
    );
  }

  configure(cfGUID: string, clientID: string, clientSecret: string): Observable<UserInviteResponse> {
    const formData: FormData = new FormData();
    formData.append('client_id', clientID);
    formData.append('client_secret', clientSecret);
    const url = `/pp/${proxyAPIVersion}/invite/${cfGUID}`;
    const obs$ = this.http.post(url, formData).pipe(
      map(v => {
        this.store.dispatch(new GetSystemInfo());
        return {
          error: false
        };
      }),
      catchError(err => {
        let message = 'Failed to configure User Invitation';
        if (err && err.error && err.error.error) {
          message = err.error.error;
        }
        return observableOf({
          error: true,
          errorMessage: message
        });
      })
    );
    // obs$.subscribe(
    //   data => console.log(data),
    //   err => {
    //     console.log(err);
    //     // Snackbar
    //     let message = 'Failed to configure User Invitation';
    //     if (err && err.error && err.error.error) {
    //       message = err.error.error;
    //     }
    //     this.snackBar.open(message);
    //   }
    // );
    return obs$;
  }

  unconfigure(cfGUID: string): Observable<UserInviteResponse> {
    const url = `/pp/${proxyAPIVersion}/invite/${cfGUID}`;
    return this.http.delete(url).pipe(
      map(v => {
        this.store.dispatch(new GetSystemInfo());
        return {
          error: false
        };
      }),
      catchError(err => {
        let message = 'Failed to configure User Invitation';
        if (err && err.error && err.error.error) {
          message = err.error.error;
        }
        return observableOf({
          error: true,
          errorMessage: message
        });
      })
    );

  }

  canShowInviteUser(cfGuid: string, orgGuid: string, spaceGuid: string): Observable<boolean> {
    // Can only invite someone to an org or space
    return !orgGuid ? observableOf(false) : waitForCFPermissions(this.store, cfGuid).pipe(
      switchMap(() => combineLatest(
        this.configured$,
        this.currentUserPermissionsService.can(
          spaceGuid ? CurrentUserPermissions.SPACE_CHANGE_ROLES : CurrentUserPermissions.ORGANIZATION_CHANGE_ROLES,
          cfGuid,
          orgGuid,
          spaceGuid
        )
      )),
      map(([configured, canChangeRoles]) => !!configured && !!canChangeRoles)
    );
  }

  invite(cfGuid: string, orgGuid: string, spaceGuid: string, spaceRole: UserInviteSendSpaceRoles, emails: string[]):
    Observable<UserInviteSendResponse> {
    const users: UserInviteSendRequest = {
      org: orgGuid,
      space: spaceGuid,
      spaceRoles: {
        [spaceRole]: true
      },
      emails
    };
    return this.http.post(`/pp/${proxyAPIVersion}/invite/send/${cfGuid}`, users).pipe(
      map((response: UserInviteSendUaaResponse) => ({
        error: response.failed_invites.length > 0,
        ...response
      })),
      catchError(err => observableOf({
        error: true,
        errorMessage: err && err.error && err.error.error ?
          err.error.error :
          `Failed to either create ${emails.length === 1 ? 'user' : 'users'} or add basic roles`,
        failed_invites: [],
        new_invites: []
      }))
    );
  }
}