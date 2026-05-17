<?php

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserServerGroupPreference extends Model
{
    protected $table = 'user_server_group_preferences';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    public static array $validationRules = [
        'user_id' => 'required|integer|exists:users,id',
        'server_group_id' => 'required|integer|exists:server_groups,id',
        'collapsed' => 'boolean',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'server_group_id' => 'integer',
        'collapsed' => 'boolean',
        self::CREATED_AT => 'datetime',
        self::UPDATED_AT => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function group(): BelongsTo
    {
        return $this->belongsTo(ServerGroup::class, 'server_group_id');
    }
}
