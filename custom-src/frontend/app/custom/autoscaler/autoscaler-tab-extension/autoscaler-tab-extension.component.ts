import { StratosTab, StratosTabType } from '../../../core/extension/extension-service';
import { ApplicationService } from '../../../features/applications/application.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, SimpleSnackBar } from '@angular/material';
import { Store } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, filter, first, map, publishReplay, refCount } from 'rxjs/operators';
import {
  DetachAppAutoscalerPolicyAction,
  GetAppAutoscalerAppMetricAction,
  GetAppAutoscalerPolicyAction,
  GetAppAutoscalerHealthAction,
  GetAppAutoscalerScalingHistoryAction,
  UpdateAppAutoscalerPolicyAction,
} from '../app-autoscaler.actions';
import { RouterNav } from '../../../../../store/src/actions/router.actions';
import { AppState } from '../../../../../store/src/app-state';
import { MetricTypes } from '../autoscaler-helpers/autoscaler-util';
import {
  appAutoscalerHealthSchemaKey,
  appAutoscalerAppMetricSchemaKey,
  appAutoscalerPolicySchemaKey,
  appAutoscalerScalingHistorySchemaKey,
  entityFactory,
} from '../../../../../store/src/helpers/entity-factory';
import { ActionState } from '../../../../../store/src/reducers/api-request-reducer/types';
import {
  getPaginationObservables,
} from '../../../../../store/src/reducers/pagination-reducer/pagination-reducer.helper';
import { selectUpdateInfo } from '../../../../../store/src/selectors/api.selectors';
import {
  AppAutoscalerAppMetric,
  AppAutoscalerPolicy,
  AppAutoscalerScalingHistory,
} from '../app-autoscaler.types';
import { EntityService } from '../../../core/entity-service';
import { EntityServiceFactory } from '../../../core/entity-service-factory.service';
import { ConfirmationDialogConfig } from '../../../shared/components/confirmation-dialog.config';
import { ConfirmationDialogService } from '../../../shared/components/confirmation-dialog.service';
import { PaginationMonitorFactory } from '../../../shared/monitors/pagination-monitor.factory';

@StratosTab({
  type: StratosTabType.Application,
  label: 'Autoscale',
  link: 'autoscale',
  action: new GetAppAutoscalerHealthAction(window.location.pathname.split('/')[3], window.location.pathname.split('/')[2])
})
@Component({
  selector: 'app-autoscaler-tab-extension',
  templateUrl: './autoscaler-tab-extension.component.html',
  styleUrls: ['./autoscaler-tab-extension.component.scss'],
})
export class AutoscalerTabExtensionComponent implements OnInit, OnDestroy {

  scalingRuleColumns: string[] = ['metric', 'condition', 'action'];
  specificDateColumns: string[] = ['from', 'to', 'init', 'min', 'max'];
  recurringScheduleColumns: string[] = ['effect', 'repeat', 'from', 'to', 'init', 'min', 'max'];
  scalingHistoryColumns: string[] = ['event', 'trigger', 'date', 'error'];
  metricTypes: string[] = MetricTypes;

  appAutoscalerHealthService: EntityService;
  appAutoscalerPolicyService: EntityService;
  appAutoscalerScalingHistoryService: EntityService;
  appAutoscalerEnablement$: Observable<Boolean>;
  appAutoscalerPolicy$: Observable<AppAutoscalerPolicy>;
  appAutoscalerScalingHistory$: Observable<AppAutoscalerScalingHistory>;

  private appAutoscalerPolicyErrorSub: Subscription;
  private appAutoscalerScalingHistoryErrorSub: Subscription;
  private appAutoscalerPolicySnackBarRef: MatSnackBarRef<SimpleSnackBar>;
  private appAutoscalerScalingHistorySnackBarRef: MatSnackBarRef<SimpleSnackBar>;

  private detachConfirmOk = 0;

  appAutoscalerAppMetrics = {};
  appAutoscalerInsMetrics = {};
  appAutoscalerAppMetricNames = [];

  paramsMetrics = {
    'start-time': 0,
    'end-time': (new Date()).getTime().toString() + '000000',
    page: '1',
    'results-per-page': '1',
    order: 'desc'
  };
  paramsHistory = {
    'start-time': 0,
    'end-time': (new Date()).getTime().toString() + '000000',
    page: '1',
    'results-per-page': '5',
    order: 'desc'
  };

  ngOnDestroy(): void {
    if (this.appAutoscalerPolicySnackBarRef) {
      this.appAutoscalerPolicySnackBarRef.dismiss();
    }
    if (this.appAutoscalerScalingHistorySnackBarRef) {
      this.appAutoscalerScalingHistorySnackBarRef.dismiss();
    }
    if (this.appAutoscalerPolicyErrorSub) {
      this.appAutoscalerPolicyErrorSub.unsubscribe();
    }
    if (this.appAutoscalerScalingHistoryErrorSub) {
      this.appAutoscalerScalingHistoryErrorSub.unsubscribe();
    }
  }

  constructor(
    private store: Store<AppState>,
    private applicationService: ApplicationService,
    private entityServiceFactory: EntityServiceFactory,
    private paginationMonitorFactory: PaginationMonitorFactory,
    private appAutoscalerPolicySnackBar: MatSnackBar,
    private appAutoscalerScalingHistorySnackBar: MatSnackBar,
    private confirmDialog: ConfirmationDialogService,
  ) { }

  ngOnInit() {
    // this.appAutoscalerHealthService = this.entityServiceFactory.create(
    //   appAutoscalerHealthSchemaKey,
    //   entityFactory(appAutoscalerHealthSchemaKey),
    //   this.applicationService.appGuid,
    //   new GetAppAutoscalerHealthAction(this.applicationService.appGuid, this.applicationService.cfGuid),
    //   false
    // );
    // this.appAutoscalerEnablement$ = this.appAutoscalerHealthService.entityObs$.pipe(
    //   map(({ entity }) => {
    //     if (entity &&  entity.entity && entity.entity.uptime > 0) {
    //       console.log(true)
    //       return true;
    //     } else {
    //       console.log(false)
    //       return false;
    //     }
    //   }),
    //   publishReplay(1),
    //   refCount()
    // );
    this.appAutoscalerPolicyService = this.entityServiceFactory.create(
      appAutoscalerPolicySchemaKey,
      entityFactory(appAutoscalerPolicySchemaKey),
      this.applicationService.appGuid,
      new GetAppAutoscalerPolicyAction(this.applicationService.appGuid, this.applicationService.cfGuid),
      false
    );
    this.appAutoscalerPolicy$ = this.appAutoscalerPolicyService.entityObs$.pipe(
      map(({ entity }) => {
        if (entity && entity.entity) {
          this.appAutoscalerAppMetricNames = Object.keys(entity.entity.scaling_rules_map);
          this.loadLatestMetricsUponPolicy(entity.entity);
        }
        return entity && entity.entity;
      }),
      publishReplay(1),
      refCount()
    );
    this.appAutoscalerScalingHistoryService = this.entityServiceFactory.create(
      appAutoscalerScalingHistorySchemaKey,
      entityFactory(appAutoscalerScalingHistorySchemaKey),
      this.applicationService.appGuid,
      new GetAppAutoscalerScalingHistoryAction('', this.applicationService.appGuid,
        this.applicationService.cfGuid, true, this.paramsHistory),
      false
    );
    this.appAutoscalerScalingHistory$ = this.appAutoscalerScalingHistoryService.entityObs$.pipe(
      map(({ entity }) => entity && entity.entity)
    );
    this.initErrorSub();
  }

  getAppMetric(metricName: string, trigger: any, params: any) {
    const action = new GetAppAutoscalerAppMetricAction(this.applicationService.appGuid,
      this.applicationService.cfGuid, metricName, true, trigger, params);
    return getPaginationObservables<AppAutoscalerAppMetric>({
      store: this.store,
      action,
      paginationMonitor: this.paginationMonitorFactory.create(
        action.paginationKey,
        entityFactory(appAutoscalerAppMetricSchemaKey)
      )
    }, false).entities$;
  }

  loadLatestMetricsUponPolicy(policyEntity) {
    if (policyEntity.scaling_rules_map) {
      this.appAutoscalerAppMetrics = {};
      Object.keys(policyEntity.scaling_rules_map).map((metricName) => {
        this.appAutoscalerAppMetrics[metricName] =
          this.getAppMetric(metricName, policyEntity.scaling_rules_map[metricName], this.paramsMetrics);
      });
    }
  }

  initErrorSub() {
    this.appAutoscalerPolicyErrorSub = this.appAutoscalerPolicyService.entityMonitor.entityRequest$.pipe(
      filter(request => !!request.error),
      map(request => request.message),
      distinctUntilChanged(),
    ).subscribe(errorMessage => {
      if (this.appAutoscalerPolicySnackBarRef) {
        this.appAutoscalerPolicySnackBarRef.dismiss();
      }
      this.appAutoscalerPolicySnackBarRef = this.appAutoscalerPolicySnackBar.open(errorMessage, 'Dismiss');
    });

    this.appAutoscalerScalingHistoryErrorSub = this.appAutoscalerScalingHistoryService.entityMonitor.entityRequest$.pipe(
      filter(request => !!request.error),
      map(request => request.message),
      distinctUntilChanged(),
    ).subscribe(errorMessage => {
      if (this.appAutoscalerScalingHistorySnackBarRef) {
        this.appAutoscalerScalingHistorySnackBarRef.dismiss();
      }
      this.appAutoscalerScalingHistorySnackBarRef = this.appAutoscalerScalingHistorySnackBar.open(errorMessage, 'Dismiss');
    });
  }

  diableAutoscaler() {
    const confirmation = new ConfirmationDialogConfig(
      'Detach And Delete Policy',
      'Are you sure you want to detach and delete the policy?',
      'Detach and Delete',
      true
    );
    this.detachConfirmOk = this.detachConfirmOk === 1 ? 0 : 1;
    this.confirmDialog.open(confirmation, () => {
      this.detachConfirmOk = 2;
      const doUpdate = () => this.detachPolicy();
      doUpdate().pipe(
        first(),
      ).subscribe(actionState => {
        if (actionState.error) {
          this.appAutoscalerPolicySnackBarRef =
            this.appAutoscalerPolicySnackBar.open(`Failed to detach policy: ${actionState.message}`, 'Dismiss');
        }
      });
    });
  }

  detachPolicy(): Observable<ActionState> {
    this.store.dispatch(
      new DetachAppAutoscalerPolicyAction(this.applicationService.appGuid, this.applicationService.cfGuid)
    );
    const actionState = selectUpdateInfo(appAutoscalerPolicySchemaKey,
      this.applicationService.appGuid,
      UpdateAppAutoscalerPolicyAction.updateKey);
    return this.store.select(actionState).pipe(filter(item => !!item));
  }

  updatePolicyPage = () => {
    this.store.dispatch(new RouterNav({
      path: [
        'autoscaler',
        this.applicationService.cfGuid,
        this.applicationService.appGuid,
        'edit-autoscaler-policy'
      ]
    }));
  }

  metricChartPage() {
    this.store.dispatch(new RouterNav({
      path: [
        'autoscaler',
        this.applicationService.cfGuid,
        this.applicationService.appGuid,
        'app-autoscaler-metric-page'
      ]
    }));
  }

  scaleHistoryPage() {
    this.store.dispatch(new RouterNav({
      path: [
        'autoscaler',
        this.applicationService.cfGuid,
        this.applicationService.appGuid,
        'app-autoscaler-scale-history-page'
      ]
    }));
  }
}