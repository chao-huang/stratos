import { Component } from '@angular/core';
import { Store } from '@ngrx/store';
import * as moment from 'moment';
import { Observable, of as observableOf } from 'rxjs';
import { map } from 'rxjs/operators';
import { isEndpointTypeFavorite } from '../../../core/user-favorite-helpers';
import { endpointEntitiesSelector } from '../../../store/selectors/endpoint.selectors';
import { recentlyVisitedSelector } from '../../../store/selectors/recently-visitied.selectors';
import { IRecentlyVisitedEntityDated } from '../../../store/types/recently-visited.types';
import { AppState } from './../../../store/app-state';
interface IRelevanceModifier {
  time: number;
  modifier: number;
}
interface IRelevanceModifiers {
  high: IRelevanceModifier;
  medium: IRelevanceModifier;
  low: IRelevanceModifier;
}
class CountedRecentEntitiesManager {
  private countedRecentEntities: CountedRecentEntities = {};
  private relevanceModifiers: IRelevanceModifiers;

  constructor(mostRecentTime: moment.Moment, private store: Store<AppState>) {
    this.relevanceModifiers = {
      high: {
        time: mostRecentTime.subtract(30, 'minute').unix(),
        modifier: 2
      },
      medium: {
        time: mostRecentTime.subtract(1, 'day').unix(),
        modifier: 1.5
      },
      low: {
        time: mostRecentTime.subtract(1, 'week').unix(),
        modifier: 1
      }
    };
  }

  private getModifier(recentEntity: IRecentlyVisitedEntityDated) {
    if (recentEntity.date < this.relevanceModifiers.low.time) {
      return this.relevanceModifiers.low.modifier;
    }
    if (recentEntity.date < this.relevanceModifiers.medium.time) {
      return this.relevanceModifiers.medium.modifier;
    }
    return this.relevanceModifiers.high.modifier;
  }

  public addEntity(recentEntity: IRecentlyVisitedEntityDated) {
    const modifier = this.getModifier(recentEntity);
    if (!this.countedRecentEntities[recentEntity.guid]) {
      this.countedRecentEntities[recentEntity.guid] = new CountedRecentEntity(recentEntity, this.store);
    }
    this.countedRecentEntities[recentEntity.guid].increment(modifier);
  }
  public getStoredEntities(): CountedRecentEntity[] {
    return Object.values(this.countedRecentEntities)
      .sort((countedA, countedB) => countedB.count - countedA.count)
      .map(counted => counted);
  }
}
interface CountedRecentEntities {
  [entityId: string]: CountedRecentEntity;
}

class CountedRecentEntity {
  public subText$: Observable<string>;
  public count = 0;
  public increment(modifier?: number) {
    const amount = modifier ? 1 * modifier : 1;
    this.count += amount;
  }

  constructor(readonly entity: IRecentlyVisitedEntityDated, private store: Store<AppState>) {
    if (entity.favorite) {
      if (isEndpointTypeFavorite(entity.favorite)) {
        this.subText$ = observableOf(entity.prettyType);
      } else {
        this.subText$ = this.store.select(endpointEntitiesSelector).pipe(
          map(endpoints => {
            if (Object.keys(endpoints).length > 1) {
              return `${entity.prettyType} - ${endpoints[entity.favorite.endpointId].name}  (${entity.prettyEndpointType})`;
            }
            return entity.prettyType;
          })
        );
      }
    } else {
      this.subText$ = observableOf(`${entity.prettyEndpointType} - ${entity.prettyType}`);
    }

  }
}

@Component({
  selector: 'app-recent-entities',
  templateUrl: './recent-entities.component.html',
  styleUrls: ['./recent-entities.component.scss']
})
export class RecentEntitiesComponent {
  public recentEntities$: Observable<CountedRecentEntity[]>;
  constructor(store: Store<AppState>) {

    this.recentEntities$ = store.select(recentlyVisitedSelector).pipe(
      map(recentEntities => {
        const manager = new CountedRecentEntitiesManager(moment(recentEntities[0]), store);
        recentEntities.forEach(recentEntity => {
          manager.addEntity(recentEntity);
        });
        return manager.getStoredEntities();
      })
    );

  }
}