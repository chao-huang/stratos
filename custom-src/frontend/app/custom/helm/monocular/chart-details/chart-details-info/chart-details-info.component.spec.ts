import { NO_ERRORS_SCHEMA } from '@angular/core';
import { async, TestBed } from '@angular/core/testing';

import { ChartsService } from '../../shared/services/charts.service';
import { ChartDetailsInfoComponent } from './chart-details-info.component';


describe('Component: ChartDetailsInfo', () => {
  beforeEach(
    async(() => {
      TestBed.configureTestingModule({
        declarations: [ChartDetailsInfoComponent],
        imports: [],
        providers: [{ provide: ChartsService }],
        schemas: [NO_ERRORS_SCHEMA]
      }).compileComponents();
    })
  );
  it('should create an instance', () => {
    const component = TestBed.createComponent(ChartDetailsInfoComponent);
    expect(component).toBeTruthy();
  });
});
