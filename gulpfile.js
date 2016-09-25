const gulp = require('gulp');
const sass = require('gulp-sass');
const plumber = require('gulp-plumber');
const notify = require('gulp-notify');
const pug = require('gulp-pug');

gulp.task('sass', () => {
	gulp.src('src/*.scss')
		.pipe(plumber({ errorHandler: notify.onError('<%= error.message %>') }))
		.pipe(sass.sync())
		.pipe(gulp.dest('./dst'));
});

gulp.task('pug', () => {
	gulp.src('src/*.pug')
		.pipe(plumber({ errorHandler: notify.onError('<%= error.message %>') }))
		.pipe(pug({}))
		.pipe(gulp.dest('./dst'));
});

gulp.task('watch', () => {
	gulp.run('sass');
	gulp.run('pug');
	gulp.watch('src/*.scss', ['sass']);
	gulp.watch('src/*.pug', ['pug']);
});

gulp.task('default', ['sass', 'pug']);
