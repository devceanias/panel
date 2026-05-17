<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index('position');
        });

        Schema::table('servers', function (Blueprint $table) {
            $table->unsignedBigInteger('server_group_id')->nullable()->after('owner_id');
            $table->unsignedInteger('dashboard_position')->default(0)->after('server_group_id');

            $table->foreign('server_group_id')->references('id')->on('server_groups')->nullOnDelete();
            $table->index(['server_group_id', 'dashboard_position']);
        });

        Schema::create('user_server_group_preferences', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id');
            $table->unsignedBigInteger('server_group_id');
            $table->boolean('collapsed')->default(false);
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('server_group_id')->references('id')->on('server_groups')->cascadeOnDelete();
            $table->unique(['user_id', 'server_group_id'], 'user_server_group_preferences_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_server_group_preferences');

        Schema::table('servers', function (Blueprint $table) {
            $table->dropForeign(['server_group_id']);
            $table->dropIndex(['server_group_id', 'dashboard_position']);
            $table->dropColumn(['server_group_id', 'dashboard_position']);
        });

        Schema::dropIfExists('server_groups');
    }
};
