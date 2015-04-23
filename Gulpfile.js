(function(require){
    'use strict';

    var project = require('./package.json'),
        path = require('path'),
        distPath = path.join(__dirname, 'dist', 'web', project.name),
        production = process.env.NODE_ENV === 'production';

    // Load plugins
    var gulp = require('gulp'),
        gutil = require('gulp-util'),
        buffer = require('gulp-buffer'),
        transform = require('vinyl-transform'),
        source = require('vinyl-source-stream'),
        fs = require('fs'),
        stream = require('stream'),
        mustache = require('mustache'),
        gulpstache = require("gulp-mustache"),
        less = require('gulp-less'),
        minifycss = require('gulp-minify-css'),
        rename = require('gulp-rename'),
        concat = require('gulp-concat'),
        del = require('del'),

        jshint = require('gulp-jshint'),
        jscs = require('gulp-jscs'),

        karma = require('karma').server,
        notifier = require('node-notifier'),

        browserify = require('browserify'),
        babelify = require('babelify'),
        debowerify = require('debowerify'),
        browserify_ngannotate = require('browserify-ngannotate'),
        uglify = require('gulp-uglify'),
        sourcemaps = require('gulp-sourcemaps');

    var browserified = transform(function(filename) {
      var b = browserify({entries: filename, debug: true});
      return b.bundle();
    });

    function mustachifyWebParts(webParts, templatePath){
      var webParts = project.webParts || [],
          template = fs.readFileSync(templatePath, {encoding: 'utf8'}),
          src = stream.Readable({ objectMode: true });

      src._read = function () {
        mustache.parse(template); // speeds up mustache templating
        webParts.forEach(function(webPart) {
          var templatedOutput = mustache.render(template, {htmlFilePrefix: webPart.htmlFilePrefix});
          this.push(new gutil.File({ cwd: __dirname, base: path.join(__dirname, './webParts/'), path: path.join(__dirname, './webParts/', webPart.name + '.webpart.xml'), contents: new Buffer(templatedOutput) }))
          this.push(null)
        }, this)
      }
      return src
    };

     
    // Module definition XML for LabKey
    gulp.task('labkey:module', function() {
      return gulp.src("./templates/module.xml.mustache")
        .pipe(gulpstache({
            name: project.name,
            // LabKey needs double values for the version, so can't cope with SemVer.
            // We'll take the major and minor numbers to make the LabKey version.
            version: project.version.split(".").slice(0,2).join('.')
        }))
        .pipe(rename('module.xml'))
        .pipe(gulp.dest(path.join(__dirname, 'dist', 'config')));
    });

    // Generates the XML definitions for each WebPart
    gulp.task('labkey:webParts', function() {
      return mustachifyWebParts(project.webParts, "./templates/webpart.xml.mustache")
        .pipe(gulp.dest(path.join(__dirname, 'dist', 'views')));
    });

    gulp.task('views', ['labkey:webParts'], function() {
      return gulp.src("./views/**/*.html")
        .pipe(gulp.dest(path.join(__dirname, 'dist', 'views')));
    });

    // Styles
    gulp.task('styles', function() {
      return gulp.src('./less/**/*.less')
        .pipe(less())
        .pipe(rename({ suffix: '.min' }))
        .pipe(minifycss())
        .pipe(gulp.dest(path.join(distPath, 'styles')));
    });

    // Fonts
    gulp.task('fonts', function() {
      return gulp.src('./bower_components/fontawesome/fonts/*')
        .pipe(gulp.dest(path.join(distPath, 'fonts')));
    });

    gulp.task('scripts:test', function (done) {
      karma.start({
        configFile: __dirname + '/karma.conf.js',
        singleRun: true
      }, done);
    });

    // Validate JavaScript
    gulp.task('scripts:validate', function() {
      return gulp.src(['./js/**/*.js'])
        .pipe(jshint())
        .pipe(jshint.reporter('default'))
        //.pipe(jscs());
    });

    // Build JavaScript
    gulp.task('scripts:build', function() {

      var bundler = browserify('./js/labking.module.js', {standalone: 'noscope'});

      return bundler
        .transform(babelify)
        .transform(debowerify)
        .transform(browserify_ngannotate)
        .bundle()
        .pipe(source('index.js'))
        .pipe(buffer())
  
        .pipe(sourcemaps.init({loadMaps: true}))
          //.pipe(uglify())
        .pipe(sourcemaps.write('./', {sourceMappingURLPrefix: '/labkey/labking/js/' }))
        .pipe(gulp.dest(path.join(distPath, 'js')));
    });
     
    gulp.task('copy-partials', function() {
      return gulp.src(['./js/**/*.html'])
      .pipe(gulp.dest(path.join(distPath, 'js')));
    });

    // Clean
    gulp.task('clean', function(cb) {
      del(['dist/**'], cb);
    });

    // // Deploy
    // gulp.task('deploy', ['default'], function() {
    //   if(project.deployPath){
    //     return gulp.src(path.join(__dirname, 'dist', '**'))
    //         .pipe(gulp.dest(path.join(project.deployPath, project.name)));
    //     // if(!fs.existsSync(project.deployPath)){
    //     //   gutil.log('The `deployDir` specified in package.json does not exist.');
    //     // }else{
    //     //   // remove deploy directory contents
    //     //   //del([path.join(project.deployPath, project.name, '**')],{force: true});
    //     //   // copy dist into it
    //     //   return gulp.src(path.join(__dirname, 'dist', '**'))
    //     //     .pipe(gulp.dest(path.join(project.deployPath, project.name)));
    //     // }
    //   }else{
    //     gutil.log('No deploy path specified. Please set `deployDir` in package.json and try again');
    //   }
    // });
     
    gulp.task('build:quick', function() {
      gulp.start('scripts:build',
        'copy-partials',
        'styles',
        'fonts',
        'labkey:module',
        'views');
    });

    // Default task
    gulp.task('default', ['clean'], function() {
        gulp.start(
          'styles', 'fonts',
          'scripts:test','scripts:validate', 'scripts:build', 'copy-partials',
          'labkey:module', 
          'views');
    });
    
    // Watch
    // gulp.task('watch', function() {
    //   gulp.watch('less/**/*.less', ['styles']);
    //   gulp.watch('js/**/*.js', ['scripts']);
    //   gulp.watch('views/**/*.html', ['views']);
    // });


}(require));
