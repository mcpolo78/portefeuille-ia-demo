import { Pipe, PipeTransform } from '@angular/core';
import { classeCss, compact, dateFr, euros, euros2, nombre } from './formats';

@Pipe({ name: 'euros' })
export class EurosPipe implements PipeTransform {
  transform(v: number, centimes = false): string {
    return (centimes ? euros2 : euros).format(v);
  }
}

@Pipe({ name: 'compact' })
export class CompactPipe implements PipeTransform {
  transform = compact;
}

@Pipe({ name: 'nombre' })
export class NombrePipe implements PipeTransform {
  transform(v: number): string {
    return nombre.format(v);
  }
}

@Pipe({ name: 'dateFr' })
export class DateFrPipe implements PipeTransform {
  transform = dateFr;
}

@Pipe({ name: 'classeCss' })
export class ClasseCssPipe implements PipeTransform {
  transform = classeCss;
}

export const PIPES = [EurosPipe, CompactPipe, NombrePipe, DateFrPipe, ClasseCssPipe] as const;
